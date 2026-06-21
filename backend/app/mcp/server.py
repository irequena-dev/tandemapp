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
import re
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


# --- Parser tolerante de fecha/hora -----------------------------------------
# Los modelos on-device (Gemma-4-E4B-it) son malos formateando fechas a ISO y
# no saben qué año es (alucinan 2024). En vez de exigirles ISO, les pedimos que
# pasen la fecha/hora tal como la dictó el usuario y la interpretamos aquí.
# El año, si no viene, lo pone el reloj del servidor (no el modelo). (issue 05)


class DateParseError(ValueError):
    """Fecha/hora no reconocida. Es ValueError para que handle_call_tool la
    devuelva al modelo como error de herramienta con un mensaje claro."""


_SPANISH_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
    "ene": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "sep": 9,
    "set": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12,
}


def _strip_accents(s: str) -> str:
    return (
        s.replace("á", "a")
        .replace("é", "e")
        .replace("í", "i")
        .replace("ó", "o")
        .replace("ú", "u")
        .replace("ñ", "n")
    )


def _resolve_year(raw_year: str | None, current_year: int) -> int:
    if raw_year is None:
        return current_year
    year = int(raw_year)
    return year + 2000 if year < 100 else year


def _safe_date(year: int, month: int, day: int, raw: str) -> date:
    try:
        return date(year, month, day)
    except ValueError as err:
        raise DateParseError(
            f"La fecha '{raw}' no es válida (día/mes/año fuera de rango). "
            "Dila en lenguaje natural, ej: '15 de julio de 2026'."
        ) from err


def parse_flexible_date(raw: str) -> date:
    """Acepta ISO (2026-07-15), DD/MM/YYYY, lenguaje natural ('15 de julio de
    2026', '15 julio') y relativos ('hoy', 'mañana', 'ayer'). Si falta el año,
    usa el año actual del servidor."""
    if not raw or not raw.strip():
        raise DateParseError("Fecha vacía.")
    s = _strip_accents(re.sub(r"\s+", " ", raw.strip().lower()))

    today = date.today()
    relatives = {
        "hoy": today,
        "manana": today + timedelta(days=1),
        "ayer": today - timedelta(days=1),
        "pasado manana": today + timedelta(days=2),
    }
    if s in relatives:
        return relatives[s]

    # Lenguaje natural: "15 de julio de 2026", "15 julio", "el 15 de julio"
    m = re.match(
        r"^(?:el\s+)?(\d{1,2})\s*(?:de\s+)?([a-z]+)\.?\s*(?:de\s+(\d{2,4}))?$",
        s,
    )
    if m and m.group(2) in _SPANISH_MONTHS:
        return _safe_date(
            _resolve_year(m.group(3), today.year),
            _SPANISH_MONTHS[m.group(2)],
            int(m.group(1)),
            raw,
        )

    # Numérico: "15/07/2026", "15-7-26", "2026-07-15", "15.07.2026"
    m = re.match(r"^(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})$", s)
    if m:
        a, b, c = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if a >= 1000:  # YYYY-MM-DD
            year, month, day = a, b, c
        else:  # DD-MM-YYYY (formato europeo/español)
            day, month, year = a, b, c + 2000 if c < 100 else c
        return _safe_date(year, month, day, raw)

    raise DateParseError(
        f"No reconocí la fecha '{raw}'. Dila como el usuario: "
        "'15 de julio de 2026', 'mañana' o '15/07/2026'."
    )


def parse_flexible_time(raw: str) -> time:
    """Acepta '16:00', '16.30', '4 de la tarde', 'por la noche', 'a las 5'.
    Rescata entradas con basura tipo '16:000'."""
    if not raw or not raw.strip():
        raise DateParseError("Hora vacía.")
    s = _strip_accents(re.sub(r"\s+", " ", raw.strip().lower()))

    afternoon = "tarde" in s or "pm" in s
    night = "noche" in s
    morning = ("manana" in s or "am" in s) and not afternoon and not night

    nums = re.findall(r"\d+", s)
    if not nums:
        raise DateParseError(
            f"No reconocí la hora '{raw}'. Dila como 'a las 4' o '16:00'."
        )
    hours = int(nums[0])
    minutes = int(nums[1]) if len(nums) > 1 else 0
    if minutes >= 60:  # rescata '16:000' -> minutos 0
        minutes = 0
    if (afternoon or night) and hours < 12:
        hours += 12
    if morning and hours == 12:
        hours = 0
    if hours > 23:
        raise DateParseError(
            f"La hora '{raw}' no es válida. Dila como 'a las 4' o '16:00'."
        )
    return time(hours, minutes)


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
    visited_at_date = parse_flexible_date(visited_at)
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
                visited_at=visited_at_date,
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
    # Nota: las descripciones (incluidos los enum) son lo que el modelo lee para
    # saber qué valores son válidos y a qué tool enrutar. Sin enum, el modelo
    # inventa valores (ej: "calzado" en vez de "footwear"). (issue 05)
    return [
        Tool(
            name="list_children",
            description=(
                "Lista los hijos (niños y niñas) de la familia con su nombre y "
                "fecha de nacimiento. Úsala cuando necesites saber quiénes son o "
                "el nombre exacto de un hijo antes de registrar algo."
            ),
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="add_shopping_items",
            description="Añade productos a la lista de la compra de la familia.",
            inputSchema={
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            'Lista de productos a añadir, ej: ["leche", "pan"].'
                        ),
                    }
                },
                "required": ["items"],
            },
        ),
        Tool(
            name="record_health_visit",
            description=(
                "Registra una visita médica (pediatra, urgencias, etc.) de un hijo."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {
                        "type": "string",
                        "description": 'Nombre del hijo, ej: "Lucas".',
                    },
                    "visited_at": {
                        "type": "string",
                        "description": (
                            "Fecha de la visita. NO la formatees: pasa lo que "
                            "dijo el usuario (ej: '15 de julio de 2026', "
                            "'ayer', '2026-06-20'). Si no dijo año, no lo "
                            "inventes (el servidor usará el año actual)."
                        ),
                    },
                    "diagnosis": {
                        "type": "string",
                        "description": "Diagnóstico o motivo de la visita.",
                    },
                    "notes": {
                        "type": "string",
                        "description": "Notas u observaciones adicionales (opcional).",
                    },
                },
                "required": ["child_name", "visited_at", "diagnosis"],
            },
        ),
        Tool(
            name="start_pauta",
            description=(
                "Inicia un tratamiento médico (pauta de medicación) para un hijo. "
                "Devuelve el id de la pauta."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string", "description": "Nombre del hijo."},
                    "medication": {
                        "type": "string",
                        "description": 'Nombre del medicamento, ej: "ibuprofeno".',
                    },
                    "dose": {
                        "type": "string",
                        "description": 'Dosis por toma, ej: "5 ml".',
                    },
                    "interval": {
                        "type": "integer",
                        "description": "Horas entre cada toma, ej: 8.",
                    },
                    "duration": {
                        "type": "integer",
                        "description": "Días que dura el tratamiento, ej: 5.",
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
                "Registra que se ha dado una dosis de un tratamiento activo. "
                "Requiere el id de la pauta "
                "(obtenido de start_pauta o list_active_pautas)."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "pauta_id": {
                        "type": "string",
                        "description": 'ID (UUID) de la pauta, ej: "b77fcb88-...".',
                    },
                },
                "required": ["pauta_id"],
            },
        ),
        Tool(
            name="finish_pauta",
            description=("Finaliza un tratamiento activo. Requiere el id de la pauta."),
            inputSchema={
                "type": "object",
                "properties": {
                    "pauta_id": {
                        "type": "string",
                        "description": "ID (UUID) de la pauta a finalizar.",
                    },
                },
                "required": ["pauta_id"],
            },
        ),
        Tool(
            name="list_active_pautas",
            description=(
                "Lista los tratamientos (pautas) activos, con su id, medicación y "
                "pauta de dosis. Úsala antes de record_administration para obtener el "
                "pauta_id."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {
                        "type": "string",
                        "description": "Filtrar por hijo (opcional).",
                    },
                },
                "required": [],
            },
        ),
        Tool(
            name="record_measurement",
            description="Registra el peso o la altura de un hijo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string", "description": "Nombre del hijo."},
                    "type": {
                        "type": "string",
                        "enum": sorted(VALID_MEASUREMENT_TYPES),
                        "description": (
                            "'height' para altura (unidad: cm) o 'weight' para peso "
                            "(unidad: kg)."
                        ),
                    },
                    "value": {
                        "type": "number",
                        "description": "Valor numérico de la medida, ej: 82.5.",
                    },
                    "unit": {
                        "type": "string",
                        "enum": ["cm", "kg"],
                        "description": "'cm' si type=height, 'kg' si type=weight.",
                    },
                },
                "required": ["child_name", "type", "value", "unit"],
            },
        ),
        Tool(
            name="record_size",
            description="Registra la talla de ropa o de calzado de un hijo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "child_name": {"type": "string", "description": "Nombre del hijo."},
                    "type": {
                        "type": "string",
                        "enum": sorted(VALID_SIZE_TYPES),
                        "description": (
                            "'clothing' para ropa o 'footwear' para calzado (zapatos)."
                        ),
                    },
                    "label": {
                        "type": "string",
                        "description": (
                            'Talla tal cual se escribe, ej: "80", "86" (ropa) '
                            'o "24", "25" (calzado).'
                        ),
                    },
                },
                "required": ["child_name", "type", "label"],
            },
        ),
        Tool(
            name="list_event_types",
            description=(
                "Lista los tipos de evento disponibles (ej: Cumpleaños, Vacuna, "
                "Otros). Úsala antes de create_event para conocer el nombre exacto "
                "del tipo."
            ),
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="create_event",
            description="Crea un evento en la agenda de la familia.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": 'Título del evento, ej: "Cumple de Lucas".',
                    },
                    "date": {
                        "type": "string",
                        "description": (
                            "Fecha del evento. NO la formatees: pasa lo que "
                            "dijo el usuario (ej: '15 de julio de 2026', "
                            "'mañana', '15/07/2026'). Si no dijo año, no lo "
                            "inventes (el servidor usará el año actual)."
                        ),
                    },
                    "type": {
                        "type": "string",
                        "description": (
                            "Nombre del tipo de evento (ver list_event_types), ej: "
                            '"Cumpleaños". Si no existe, se usa "Otros".'
                        ),
                    },
                    "time": {
                        "type": "string",
                        "description": (
                            "Hora del evento. NO la formatees: pasa lo que "
                            "dijo el usuario (ej: 'a las 5 de la tarde', "
                            "'16:00', 'por la mañana'). Opcional."
                        ),
                    },
                    "child_name": {
                        "type": "string",
                        "description": "Asociar el evento a un hijo (opcional).",
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
            d_val = parse_flexible_date(arguments["date"])
            t_val = (
                parse_flexible_time(arguments["time"])
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
# json_response=False => respuestas SSE (text/event-stream), el camino por
# defecto del SDK y el que Edge Gallery ha probado contra servidores oficiales.
# stateless=False => sesiones persistentes (Edge Gallery gestiona Mcp-Session-Id).
http_manager = StreamableHTTPSessionManager(
    app=mcp_server,
    json_response=False,
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
