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

from mcp.server import Server
from mcp.server.fastmcp.server import StreamableHTTPASGIApp
from mcp.server.lowlevel.server import request_ctx
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
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


# 1. Servidor MCP (low-level Server estándar del SDK)
mcp_server = Server("Tándem")


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
            name="listChildren",
            description="Lista los hijos de la familia.",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="addShoppingItems",
            description="Añade items a la lista de la compra.",
            inputSchema={
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                    }
                },
                "required": ["items"],
            },
        ),
        Tool(
            name="recordHealthVisit",
            description="Registra una visita médica de un hijo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string"},
                    "visited_at": {"type": "string"},
                    "diagnosis": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["child_name", "visited_at", "diagnosis"],
            },
        ),
        Tool(
            name="startPauta",
            description="Inicia un tratamiento para un hijo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string"},
                    "medication": {"type": "string"},
                    "dose": {"type": "string"},
                    "interval": {"type": "integer"},
                    "duration": {"type": "integer"},
                },
                "required": ["child_name", "medication", "dose", "interval", "duration"],
            },
        ),
        Tool(
            name="recordAdministration",
            description="Registra una dosis dada de un tratamiento.",
            inputSchema={
                "type": "object",
                "properties": {
                    "pauta_id": {"type": "string"},
                },
                "required": ["pauta_id"],
            },
        ),
        Tool(
            name="finishPauta",
            description="Finaliza un tratamiento activo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "pauta_id": {"type": "string"},
                },
                "required": ["pauta_id"],
            },
        ),
        Tool(
            name="listActivePautas",
            description="Lista tratamientos activos.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string"},
                },
            },
        ),
        Tool(
            name="recordMeasurement",
            description="Registra peso o altura de un hijo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string"},
                    "type": {"type": "string"},
                    "value": {"type": "number"},
                    "unit": {"type": "string"},
                },
                "required": ["child_name", "type", "value", "unit"],
            },
        ),
        Tool(
            name="recordSize",
            description="Registra talla de ropa o calzado de un hijo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string"},
                    "type": {"type": "string"},
                    "label": {"type": "string"},
                },
                "required": ["child_name", "type", "label"],
            },
        ),
        Tool(
            name="listEventTypes",
            description="Lista tipos de evento disponibles.",
            inputSchema={"type": "object", "properties": {}},
        ),
        Tool(
            name="createEvent",
            description="Crea un evento en la agenda.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "date": {"type": "string"},
                    "type": {"type": "string"},
                    "time": {"type": "string"},
                    "child_name": {"type": "string"},
                },
                "required": ["title", "date", "type"],
            },
        ),
    ]


@mcp_server.call_tool()
async def handle_call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Llama a la herramienta correspondiente con sus parámetros."""
    try:
        if name == "listChildren":
            res = await do_list_children()
        elif name == "addShoppingItems":
            res = await do_add_shopping_items(arguments["items"])
        elif name == "recordHealthVisit":
            res = await do_record_health_visit(
                child_name=arguments["child_name"],
                visited_at=arguments["visited_at"],
                diagnosis=arguments["diagnosis"],
                notes=arguments.get("notes"),
            )
        elif name == "startPauta":
            res = await do_start_pauta(
                child_name=arguments["child_name"],
                medication=arguments["medication"],
                dose=arguments["dose"],
                interval=arguments["interval"],
                duration=arguments["duration"],
            )
        elif name == "recordAdministration":
            res = await do_record_administration(pauta_id=arguments["pauta_id"])
        elif name == "finishPauta":
            res = await do_finish_pauta(pauta_id=arguments["pauta_id"])
        elif name == "listActivePautas":
            res = await do_list_active_pautas(child_name=arguments.get("child_name"))
        elif name == "recordMeasurement":
            res = await do_record_measurement(
                child_name=arguments["child_name"],
                type=arguments["type"],
                value=float(arguments["value"]),
                unit=arguments["unit"],
            )
        elif name == "recordSize":
            res = await do_record_size(
                child_name=arguments["child_name"],
                type=arguments["type"],
                label=arguments["label"],
            )
        elif name == "listEventTypes":
            res = await do_list_event_types()
        elif name == "createEvent":
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


# 5. Respuesta 401 y middleware Bearer
async def _unauthorized(send, detail: str = "Token MCP inválido o revocado") -> None:
    """Respuesta HTTP 401 real."""
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


def with_bearer_auth(mcp_app: Any) -> Any:
    """Puerta Bearer: resuelve token → (member_id, family_id) en cada petición.
    Sin token o inválido → 401 antes de que el MCP app procese nada."""

    async def asgi(scope, receive, send):
        if scope["type"] != "http":
            await mcp_app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        bearer = extract_bearer(headers)
        if not bearer:
            return await _unauthorized(send)

        async with get_sessionmaker()() as session:
            identity = await resolve_token(session, bearer)

        if identity is None:
            return await _unauthorized(send)

        scope.setdefault("state", {})[MCP_IDENTITY_KEY] = identity
        await mcp_app(scope, receive, send)

    return asgi


# 6. Session manager + ASGI handler OFICIALES del SDK mcp
http_manager = StreamableHTTPSessionManager(
    app=mcp_server,
    json_response=True,
    stateless=False,
)

mcp_asgi_app = Starlette(
    debug=True,
    routes=[
        Route("/", endpoint=StreamableHTTPASGIApp(http_manager)),
    ],
)


def build_mcp_app() -> tuple[Any, Any]:
    """Construye la app MCP con puerta Bearer; devuelve (asgi_gated, lifespan)."""

    @asynccontextmanager
    async def mcp_lifespan(app):
        async with http_manager.run():
            yield

    gated = with_bearer_auth(mcp_asgi_app)
    return gated, mcp_lifespan
