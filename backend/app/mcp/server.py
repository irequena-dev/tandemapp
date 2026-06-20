"""Servidor MCP remoto de Tándem: herramientas expuestas bajo puerta Bearer.

El flujo es:
1. La app FastAPI monta en `/mcp` un ASGI wrapper (`with_bearer_auth`) que
   envuelve a la app Starlette del transport SSE.
2. El wrapper resuelve el `Authorization: Bearer` a (Miembro, Familia) vía
   `resolve_token` (SECURITY DEFINER; válido sin variable RLS). Si falla, corta
   con un 401 real.
3. El wrapper también soporta autenticación por `session_id` en peticiones POST.
4. La identidad resuelta se deposita en `scope["state"]`, de donde la lee la
   herramienta a través de `request_ctx.get().request.scope`.
5. La herramienta abre su propia transacción y fija la variable RLS de la
   Familia antes de consultar.

Rate limiting estricto por token: es responsabilidad del proxy inverso (fuera
del código de la tool); ver ADR-0006 y PRD Fase 0.
"""

import json
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from urllib.parse import parse_qs

from mcp.server import Server
from mcp.server.lowlevel.server import request_ctx
from mcp.server.sse import SseServerTransport
from mcp.types import TextContent, Tool
from sqlalchemy import func, select, text
from starlette.applications import Starlette
from starlette.routing import Route

from ..database import get_sessionmaker
from ..models import (
    DUPLICATE_GUARD_MINUTES,
    Administration,
    Child,
    Event,
    EventType,
    HealthVisit,
    Measurement,
    Pauta,
    ShoppingItem,
    Size,
)
from ..tenancy import FAMILY_VAR
from .auth import extract_bearer, resolve_token
from .child_matching import ChildMatchError, resolve_child_by_name

# Clave bajo la que el wrapper deposita (member_id, family_id) en el scope ASGI.
MCP_IDENTITY_KEY = "tandem_mcp_identity"

VALID_MEASUREMENT_TYPES = frozenset({"height", "weight"})
VALID_SIZE_TYPES = frozenset({"clothing", "footwear"})


# 1. Transport personalizado para registrar e identificar sesiones SSE
class TandemSseServerTransport(SseServerTransport):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.session_identities = {}

    @asynccontextmanager
    async def connect_sse(self, scope, receive, send):
        async with super().connect_sse(scope, receive, send) as (
            read_stream,
            write_stream,
        ):
            # Interceptar la sesión recién creada
            new_session_ids = [
                sid
                for sid in self._read_stream_writers
                if sid not in self.session_identities
            ]
            if new_session_ids:
                identity = scope.get("state", {}).get(MCP_IDENTITY_KEY)
                if identity:
                    for sid in new_session_ids:
                        self.session_identities[sid] = identity
            try:
                yield (read_stream, write_stream)
            finally:
                # Limpiar al desconectar
                for sid in list(self.session_identities.keys()):
                    if sid not in self._read_stream_writers:
                        self.session_identities.pop(sid, None)


# 2. Inicializar el servidor MCP y el transport
mcp_server = Server("Tándem")
sse_transport = TandemSseServerTransport("/messages/")


def get_http_request():
    """Obtiene la petición HTTP actual del contexto MCP."""
    try:
        return request_ctx.get().request
    except LookupError as err:
        raise RuntimeError("No active HTTP request found.") from err


# 3. Helpers con la lógica de negocio de las herramientas
async def do_list_children() -> list[dict[str, str]]:
    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            rows = (
                (
                    await session.execute(
                        select(Child).order_by(Child.birth_date, Child.name)
                    )
                )
                .scalars()
                .all()
            )
            return [
                {
                    "id": str(c.id),
                    "name": c.name,
                    "birth_date": str(c.birth_date),
                }
                for c in rows
            ]


async def do_add_shopping_items(items: list[str]) -> list[dict[str, str]]:
    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    now = datetime.now(UTC)
    created: list[dict[str, str]] = []
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            for item_text in items:
                item = ShoppingItem(
                    family_id=family_id,
                    text=item_text,
                    status="pending",
                    created_by=member_id,
                    created_at=now,
                    updated_at=now,
                )
                session.add(item)
                await session.flush()
                await session.refresh(item)
                created.append(
                    {
                        "id": str(item.id),
                        "text": item.text,
                        "status": item.status,
                    }
                )
    return created


def _child_match_error_response(err: ChildMatchError) -> dict[str, Any]:
    """Error estructurado MCP cuando el matching estricto de Hijo falla."""
    valid = [
        {"id": str(c.id), "name": c.name, "birth_date": str(c.birth_date)}
        for c in err.valid_children
    ]
    return {
        "error": err.reason,
        "message": (
            "Hijo no encontrado" if err.reason == "not_found" else "Nombre ambiguo"
        ),
        "valid_children": valid,
    }


async def do_record_health_visit(
    child_name: str,
    visited_at: str,
    diagnosis: str,
    notes: str | None = None,
) -> dict[str, Any]:
    from datetime import date as date_type

    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            result = await resolve_child_by_name(session, child_name)
            if isinstance(result, ChildMatchError):
                return _child_match_error_response(result)
            child = result
            visit = HealthVisit(
                family_id=family_id,
                child_id=child.id,
                visited_at=date_type.fromisoformat(visited_at),
                diagnosis=diagnosis,
                notes=notes,
                created_by=member_id,
            )
            session.add(visit)
            await session.flush()
            await session.refresh(visit)
            return {
                "id": str(visit.id),
                "child_id": str(visit.child_id),
                "visited_at": str(visit.visited_at),
                "diagnosis": visit.diagnosis,
                "notes": visit.notes,
                "created_by": visit.created_by,
            }


async def do_start_pauta(
    child_name: str,
    medication: str,
    dose: str,
    interval: int,
    duration: int,
) -> dict[str, Any]:
    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            result = await resolve_child_by_name(session, child_name)
            if isinstance(result, ChildMatchError):
                return _child_match_error_response(result)
            child = result
            now = datetime.now(UTC)
            pauta = Pauta(
                family_id=family_id,
                child_id=child.id,
                medication=medication,
                dose=dose,
                interval_hours=interval,
                duration_days=duration,
                started_at=now,
                status="active",
                created_by=member_id,
                created_at=now,
            )
            session.add(pauta)
            await session.flush()
            await session.refresh(pauta)
            return {
                "id": str(pauta.id),
                "child_id": str(pauta.child_id),
                "medication": pauta.medication,
                "dose": pauta.dose,
                "interval_hours": pauta.interval_hours,
                "duration_days": pauta.duration_days,
                "started_at": pauta.started_at.isoformat(),
                "status": pauta.status,
            }


async def do_record_administration(pauta_id: str) -> dict[str, Any]:
    import uuid

    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    pid = uuid.UUID(pauta_id)
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            pauta = await session.get(Pauta, pid)
            if pauta is None:
                return {"error": "not_found", "message": "Pauta no encontrada"}
            if pauta.status == "finished":
                return {"error": "finished", "message": "La Pauta ya está finalizada"}

            now = datetime.now(UTC)
            window_start = now - timedelta(minutes=DUPLICATE_GUARD_MINUTES)
            existing = (
                await session.execute(
                    select(Administration)
                    .where(Administration.pauta_id == pid)
                    .where(Administration.administered_at >= window_start)
                    .order_by(Administration.administered_at.desc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if existing is not None:
                return {
                    "id": str(existing.id),
                    "pauta_id": str(existing.pauta_id),
                    "administered_at": existing.administered_at.isoformat(),
                    "administered_by": existing.administered_by,
                    "duplicate": True,
                }

            admin = Administration(
                family_id=family_id,
                pauta_id=pid,
                administered_at=now,
                administered_by=member_id,
            )
            session.add(admin)
            await session.flush()
            await session.refresh(admin)
            return {
                "id": str(admin.id),
                "pauta_id": str(admin.pauta_id),
                "administered_at": admin.administered_at.isoformat(),
                "administered_by": admin.administered_by,
                "duplicate": False,
            }


async def do_finish_pauta(pauta_id: str) -> dict[str, Any]:
    import uuid

    request = get_http_request()
    _member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    pid = uuid.UUID(pauta_id)
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            pauta = await session.get(Pauta, pid)
            if pauta is None:
                return {"error": "not_found", "message": "Pauta no encontrada"}
            if pauta.status == "finished":
                return {
                    "error": "already_finished",
                    "message": "La Pauta ya está finalizada",
                }
            pauta.status = "finished"
            session.add(pauta)
            await session.flush()
            await session.refresh(pauta)
            return {
                "id": str(pauta.id),
                "status": pauta.status,
                "medication": pauta.medication,
            }


async def do_list_active_pautas(child_name: str | None = None) -> list[dict[str, Any]]:
    request = get_http_request()
    _member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            stmt = select(Pauta).where(Pauta.status == "active")
            if child_name is not None:
                result = await resolve_child_by_name(session, child_name)
                if isinstance(result, ChildMatchError):
                    return [_child_match_error_response(result)]
                stmt = stmt.where(Pauta.child_id == result.id)
            stmt = stmt.order_by(Pauta.started_at.desc())
            rows = (await session.execute(stmt)).scalars().all()
            return [
                {
                    "id": str(p.id),
                    "child_id": str(p.child_id),
                    "medication": p.medication,
                    "dose": p.dose,
                    "interval_hours": p.interval_hours,
                    "duration_days": p.duration_days,
                    "started_at": p.started_at.isoformat(),
                    "status": p.status,
                }
                for p in rows
            ]


async def do_record_measurement(
    child_name: str, type: str, value: float, unit: str
) -> dict:
    if type not in VALID_MEASUREMENT_TYPES:
        raise ValueError(
            json.dumps(
                {
                    "error": "invalid_type",
                    "detail": f"type debe ser uno de {sorted(VALID_MEASUREMENT_TYPES)}",
                    "valid_types": sorted(VALID_MEASUREMENT_TYPES),
                }
            )
        )

    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            child_or_err = await resolve_child_by_name(session, child_name)
            if isinstance(child_or_err, ChildMatchError):
                return _child_match_error_response(child_or_err)

            measurement = Measurement(
                family_id=family_id,
                child_id=child_or_err.id,
                type=type,
                value=value,
                unit=unit,
                measured_at=date.today(),
                recorded_by=member_id,
                created_at=datetime.now(UTC),
            )
            session.add(measurement)
            await session.flush()
            return {
                "id": str(measurement.id),
                "child_id": str(measurement.child_id),
                "type": measurement.type,
                "value": measurement.value,
                "unit": measurement.unit,
                "measured_at": str(measurement.measured_at),
            }


async def do_record_size(child_name: str, type: str, label: str) -> dict:
    if type not in VALID_SIZE_TYPES:
        raise ValueError(
            json.dumps(
                {
                    "error": "invalid_type",
                    "detail": f"type debe ser uno de {sorted(VALID_SIZE_TYPES)}",
                    "valid_types": sorted(VALID_SIZE_TYPES),
                }
            )
        )

    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            child_or_err = await resolve_child_by_name(session, child_name)
            if isinstance(child_or_err, ChildMatchError):
                return _child_match_error_response(child_or_err)

            size = Size(
                family_id=family_id,
                child_id=child_or_err.id,
                type=type,
                label=label,
                recorded_at=date.today(),
                recorded_by=member_id,
                created_at=datetime.now(UTC),
            )
            session.add(size)
            await session.flush()
            return {
                "id": str(size.id),
                "child_id": str(size.child_id),
                "type": size.type,
                "label": size.label,
                "recorded_at": str(size.recorded_at),
            }


async def do_list_event_types() -> list[dict[str, str]]:
    request = get_http_request()
    _member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            rows = (
                (await session.execute(select(EventType).order_by(EventType.name)))
                .scalars()
                .all()
            )
            return [{"id": str(et.id), "name": et.name, "icon": et.icon} for et in rows]


async def do_create_event(
    title: str,
    date_val: date,
    type_name: str,
    time_val: time | None = None,
    child_name: str | None = None,
) -> dict[str, Any]:
    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )

            # Resolver tipo: buscar por nombre case-insensitive; fallback a "Otros".
            matched_type = (
                (
                    await session.execute(
                        select(EventType).where(
                            func.lower(EventType.name) == func.lower(type_name)
                        )
                    )
                )
                .scalars()
                .first()
            )
            if matched_type is None:
                matched_type = (
                    (
                        await session.execute(
                            select(EventType).where(
                                func.lower(EventType.name) == "otros"
                            )
                        )
                    )
                    .scalars()
                    .first()
                )
            if matched_type is None:
                return {"error": "No se encontró el tipo 'Otros' en el sistema."}

            # Resolver child_name si se proporcionó.
            child_id = None
            if child_name is not None:
                result = await resolve_child_by_name(session, child_name)
                if isinstance(result, ChildMatchError):
                    valid_names = [c.name for c in result.valid_children]
                    return {
                        "error": f"Hijo no encontrado: '{child_name}'. "
                        f"Hijos válidos: {', '.join(valid_names)}"
                        if result.reason == "not_found"
                        else f"Nombre ambiguo: '{child_name}'. "
                        f"Hijos válidos: {', '.join(valid_names)}"
                    }
                child_id = result.id

            event = Event(
                family_id=family_id,
                child_id=child_id,
                title=title,
                event_type_id=matched_type.id,
                date=date_val,
                time=time_val,
                status="pending",
                created_by=member_id,
            )
            session.add(event)
            await session.flush()
            await session.refresh(event)

            return {
                "id": str(event.id),
                "title": event.title,
                "date": str(event.date),
                "time": str(event.time) if event.time else None,
                "type": matched_type.name,
                "child_id": str(event.child_id) if event.child_id else None,
                "status": event.status,
            }


# 4. Registrar herramientas nativas en mcp_server
@mcp_server.list_tools()
async def handle_list_tools() -> list[Tool]:
    """Lista las herramientas disponibles para Tándem."""
    return [
        Tool(
            name="list_children",
            description=(
                "Lista los Hijos de la Familia del token MCP "
                "(orden: nacimiento, nombre)."
            ),
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="add_shopping_items",
            description=(
                "Añade varios Ítems de compra a la lista de la Familia del token MCP."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Lista de textos de los ítems de compra a añadir"
                        ),
                    }
                },
                "required": ["items"],
            },
        ),
        Tool(
            name="record_health_visit",
            description="Registra una Visita médica para un Hijo (historial de salud).",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {
                        "type": "string",
                        "description": "Nombre del hijo/paciente",
                    },
                    "visited_at": {
                        "type": "string",
                        "description": "Fecha de la visita (YYYY-MM-DD)",
                    },
                    "diagnosis": {
                        "type": "string",
                        "description": "Diagnóstico principal",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Notas opcionales (tratamiento, observaciones)",
                    },
                },
                "required": ["child_name", "visited_at", "diagnosis"],
            },
        ),
        Tool(
            name="start_pauta",
            description="Inicia una Pauta (tratamiento) para un Hijo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {
                        "type": "string",
                        "description": "Nombre del hijo",
                    },
                    "medication": {
                        "type": "string",
                        "description": "Nombre del medicamento",
                    },
                    "dose": {
                        "type": "string",
                        "description": "Dosis (ej. '5 ml', '1 comprimido')",
                    },
                    "interval": {
                        "type": "integer",
                        "description": "Intervalo en horas entre tomas",
                    },
                    "duration": {
                        "type": "integer",
                        "description": "Duración total en días",
                    },
                },
                "required": [
                    "child_name",
                    "medication",
                    "dose",
                    "interval",
                    "duration",
                ],
            },
        ),
        Tool(
            name="record_administration",
            description=(
                "Registra que se ha dado una dosis de una Pauta (Administración)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "pauta_id": {
                        "type": "string",
                        "description": "UUID de la pauta",
                    }
                },
                "required": ["pauta_id"],
            },
        ),
        Tool(
            name="finish_pauta",
            description=(
                "Finaliza manualmente una Pauta activa (cortar el tratamiento)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "pauta_id": {
                        "type": "string",
                        "description": "UUID de la pauta",
                    }
                },
                "required": ["pauta_id"],
            },
        ),
        Tool(
            name="list_active_pautas",
            description="Lista las Pautas activas de la Familia (lectura mínima).",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {
                        "type": "string",
                        "description": "Filtro opcional por nombre de hijo",
                    }
                },
            },
        ),
        Tool(
            name="record_measurement",
            description=(
                "Registra una Medida (height/weight) para un Hijo de la Familia."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {
                        "type": "string",
                        "description": "Nombre del hijo",
                    },
                    "type": {
                        "type": "string",
                        "description": "Tipo de medida ('height' o 'weight')",
                    },
                    "value": {
                        "type": "number",
                        "description": "Valor numérico de la medida",
                    },
                    "unit": {
                        "type": "string",
                        "description": "Unidad de medida (ej. 'cm', 'kg')",
                    },
                },
                "required": ["child_name", "type", "value", "unit"],
            },
        ),
        Tool(
            name="record_size",
            description=(
                "Registra una Talla (clothing/footwear) para un Hijo de la Familia."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {
                        "type": "string",
                        "description": "Nombre del hijo",
                    },
                    "type": {
                        "type": "string",
                        "description": "Tipo de talla ('clothing' o 'footwear')",
                    },
                    "label": {
                        "type": "string",
                        "description": "Etiqueta de la talla (ej. '5-6 años', '26')",
                    },
                },
                "required": ["child_name", "type", "label"],
            },
        ),
        Tool(
            name="list_event_types",
            description=(
                "Lista los Tipos de Evento visibles: "
                "base del sistema + propios de la Familia."
            ),
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="create_event",
            description="Crea un Evento suelto en la agenda de la Familia.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Título del evento",
                    },
                    "date": {
                        "type": "string",
                        "description": "Fecha del evento (YYYY-MM-DD)",
                    },
                    "type": {
                        "type": "string",
                        "description": "Nombre de la categoría/tipo de evento",
                    },
                    "time": {
                        "type": "string",
                        "description": "Hora opcional del evento (HH:MM:SS)",
                    },
                    "child_name": {
                        "type": "string",
                        "description": "Nombre opcional del hijo asociado",
                    },
                },
                "required": ["title", "date", "type"],
            },
        ),
    ]


@mcp_server.call_tool()
async def handle_call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Llama a la herramienta correspondiente con sus parámetros."""
    try:
        if name == "list_children":
            res = await do_list_children()
        elif name == "add_shopping_items":
            res = await do_add_shopping_items(arguments["items"])
        elif name == "record_health_visit":
            res = await do_record_health_visit(
                child_name=arguments["child_name"],
                visited_at=arguments["visited_at"],
                diagnosis=arguments["diagnosis"],
                notes=arguments.get("notes"),
            )
        elif name == "start_pauta":
            res = await do_start_pauta(
                child_name=arguments["child_name"],
                medication=arguments["medication"],
                dose=arguments["dose"],
                interval=arguments["interval"],
                duration=arguments["duration"],
            )
        elif name == "record_administration":
            res = await do_record_administration(pauta_id=arguments["pauta_id"])
        elif name == "finish_pauta":
            res = await do_finish_pauta(pauta_id=arguments["pauta_id"])
        elif name == "list_active_pautas":
            res = await do_list_active_pautas(child_name=arguments.get("child_name"))
        elif name == "record_measurement":
            res = await do_record_measurement(
                child_name=arguments["child_name"],
                type=arguments["type"],
                value=float(arguments["value"]),
                unit=arguments["unit"],
            )
        elif name == "record_size":
            res = await do_record_size(
                child_name=arguments["child_name"],
                type=arguments["type"],
                label=arguments["label"],
            )
        elif name == "list_event_types":
            res = await do_list_event_types()
        elif name == "create_event":
            from datetime import date as date_type
            from datetime import time as time_type

            d_val = date_type.fromisoformat(arguments["date"])
            t_val = (
                time_type.fromisoformat(arguments["time"])
                if arguments.get("time")
                else None
            )
            res = await do_create_event(
                title=arguments["title"],
                date_val=d_val,
                type_name=arguments["type"],
                time_val=t_val,
                child_name=arguments.get("child_name"),
            )
        else:
            raise ValueError(f"Herramienta no encontrada: {name}")

        return [TextContent(type="text", text=json.dumps(res, ensure_ascii=False))]
    except ValueError as e:
        raise ValueError(str(e)) from e


# 5. Respuestas y enrutamiento ASGI Starlette
async def _unauthorized(send, detail: str = "Token MCP inválido o revocado") -> None:
    """Respuesta HTTP 401 real."""
    print(f"BARRER AUTH: Unauthorized {detail}", flush=True)
    body = json.dumps({"detail": detail}).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 401,
            "headers": [
                (b"content-type", b"application/json"),
                (b"www-authenticate", b"Bearer"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})


class SseHandler:
    def __init__(self, transport: TandemSseServerTransport, server: Server):
        self.transport = transport
        self.server = server

    async def __call__(self, scope, receive, send):
        print("SSE HANDLER: SseHandler __call__ started", flush=True)
        async with self.transport.connect_sse(scope, receive, send) as (
            read_stream,
            write_stream,
        ):
            print("SSE HANDLER: connect_sse entered, running server...", flush=True)
            await self.server.run(
                read_stream,
                write_stream,
                self.server.create_initialization_options(),
            )
            print("SSE HANDLER: server.run completed", flush=True)


class MessagesHandler:
    def __init__(self, transport: TandemSseServerTransport):
        self.transport = transport

    async def __call__(self, scope, receive, send):
        print("MESSAGES HANDLER: MessagesHandler __call__ started", flush=True)
        await self.transport.handle_post_message(scope, receive, send)
        print("MESSAGES HANDLER: handle_post_message completed", flush=True)


def with_bearer_auth(mcp_app: Any, transport: TandemSseServerTransport) -> Any:
    """Gated middleware para exigir token Bearer en el primer GET /sse,

    y validar el session_id en subsecuentes llamadas POST /messages/.
    """

    async def asgi(scope, receive, send):
        if scope["type"] != "http":
            await mcp_app(scope, receive, send)
            return

        print(
            f"MIDDLEWARE: Request path={scope['path']} "
            f"query={scope.get('query_string', b'').decode()}",
            flush=True,
        )
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        bearer = extract_bearer(headers)
        identity = None
        if bearer:
            async with get_sessionmaker()() as session:
                identity = await resolve_token(session, bearer)
            print(
                f"MIDDLEWARE: Resolved via Bearer token, identity={identity}",
                flush=True,
            )

        # Si no hay token bearer, validar por session_id
        if identity is None:
            query_string = scope.get("query_string", b"").decode("utf-8")
            query_params = parse_qs(query_string)
            session_ids = query_params.get("session_id", [])
            if session_ids:
                from uuid import UUID

                try:
                    session_id = UUID(hex=session_ids[0])
                    identity = transport.session_identities.get(session_id)
                    print(
                        f"MIDDLEWARE: Resolved via session_id={session_id}, "
                        f"identity={identity}",
                        flush=True,
                    )
                except ValueError:
                    print(
                        f"MIDDLEWARE: Invalid session_id hex={session_ids[0]}",
                        flush=True,
                    )

        if identity is None:
            print("MIDDLEWARE: Authentication failed", flush=True)
            return await _unauthorized(send)

        scope.setdefault("state", {})[MCP_IDENTITY_KEY] = identity
        await mcp_app(scope, receive, send)

    return asgi


# 6. Registrar rutas y construir aplicación Starlette

routes = [
    Route("/sse", endpoint=SseHandler(sse_transport, mcp_server), methods=["GET"]),
    Route("/messages/", endpoint=MessagesHandler(sse_transport), methods=["POST"]),
]

mcp_asgi_app = Starlette(debug=True, routes=routes)


def build_mcp_app() -> tuple[Any, Any]:
    """Construye la app MCP con puerta Bearer; devuelve (asgi_gated, lifespan)."""

    @asynccontextmanager
    async def empty_lifespan(app):
        yield

    gated = with_bearer_auth(mcp_asgi_app, sse_transport)
    return gated, empty_lifespan
