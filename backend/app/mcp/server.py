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
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from mcp.server import Server
from mcp.server.fastmcp.server import StreamableHTTPASGIApp
from mcp.server.lowlevel.server import request_ctx
from mcp.server.streamable_http_manager import StreamableHTTPSessionManager
from mcp.types import TextContent, Tool
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
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


# --- Seam unificado: identidad + sesión + transacción + RLS ------------------
# Único lugar que abre sesión, abre transacción y fija la variable RLS de la
# Familia. Los handlers `do_*` reciben un `ToolContext` y solo contienen lógica
# de dominio. (issue 01)


@dataclass
class ToolContext:
    """Contexto de ejecución de una herramienta: sesión + identidad."""

    session: AsyncSession
    member_id: str
    family_id: str


class ToolError(Exception):
    """Error unificado de herramienta MCP.

    Su forma canónica es `json.dumps(payload)` con claves `error` (razón
    estable) y `message` (texto humano). El dispatcher NO lo captura: el SDK
    del MCP lo propaga y produce un resultado `isError=True` cuyo
    `content[0].text` es exactamente `str(self)`. NO es subclase de ValueError:
    queremos que el SDK use `str(exc)` crudo como mensaje.
    """

    def __init__(self, payload: dict[str, Any]) -> None:
        if "error" not in payload or "message" not in payload:
            raise ValueError("ToolError payload requiere 'error' y 'message'")
        self.payload = payload
        super().__init__(json.dumps(payload, ensure_ascii=False))

    def __str__(self) -> str:  # noqa: D401
        return json.dumps(self.payload, ensure_ascii=False)

    @classmethod
    def child_match_error(cls, err: ChildMatchError) -> "ToolError":
        """Construye un ToolError a partir de un ChildMatchError estricto."""
        valid = [
            {"id": str(c.id), "name": c.name, "birth_date": str(c.birth_date)}
            for c in err.valid_children
        ]
        return cls(
            {
                "error": err.reason,
                "message": (
                    "Hijo no encontrado"
                    if err.reason == "not_found"
                    else "Nombre ambiguo"
                ),
                "valid_children": valid,
            }
        )


@asynccontextmanager
async def tool_session() -> AsyncIterator[ToolContext]:
    """Abre sesión + transacción + fija RLS; entrega un ToolContext listo."""
    request = get_http_request()
    member_id, family_id = request.scope["state"][MCP_IDENTITY_KEY]
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:k, :v, true)"),
                {"k": FAMILY_VAR, "v": family_id},
            )
            yield ToolContext(session=session, member_id=member_id, family_id=family_id)


# 3. Handlers de dominio. Firma unificada: (ctx, arguments) -> Any.
#    Contienen SOLO lógica de dominio. Sin get_http_request, sin get_sessionmaker,
#    sin set_config, sin leer MCP_IDENTITY_KEY.
async def do_list_children(ctx: ToolContext, arguments: dict) -> list[dict[str, str]]:
    rows = (
        (
            await ctx.session.execute(
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


async def do_add_shopping_items(
    ctx: ToolContext, arguments: dict
) -> list[dict[str, str]]:
    items: list[str] = arguments["items"]
    now = datetime.now(UTC)
    created: list[dict[str, str]] = []
    for item_text in items:
        item = ShoppingItem(
            family_id=ctx.family_id,
            text=item_text,
            status="pending",
            created_by=ctx.member_id,
            created_at=now,
            updated_at=now,
        )
        ctx.session.add(item)
        await ctx.session.flush()
        await ctx.session.refresh(item)
        created.append(
            {
                "id": str(item.id),
                "text": item.text,
                "status": item.status,
            }
        )
    return created


async def do_record_health_visit(ctx: ToolContext, arguments: dict) -> dict[str, Any]:
    child_name: str = arguments["child_name"]
    diagnosis: str = arguments["diagnosis"]
    notes: str | None = arguments.get("notes")
    try:
        visited_at_date = parse_flexible_date(arguments["visited_at"])
    except DateParseError as e:
        raise ToolError({"error": "invalid_date", "message": str(e)}) from e
    result = await resolve_child_by_name(ctx.session, child_name)
    if isinstance(result, ChildMatchError):
        raise ToolError.child_match_error(result)
    child = result
    visit = HealthVisit(
        family_id=ctx.family_id,
        child_id=child.id,
        visited_at=visited_at_date,
        diagnosis=diagnosis,
        notes=notes,
        created_by=ctx.member_id,
    )
    ctx.session.add(visit)
    await ctx.session.flush()
    await ctx.session.refresh(visit)
    return {
        "id": str(visit.id),
        "child_id": str(visit.child_id),
        "visited_at": str(visit.visited_at),
        "diagnosis": visit.diagnosis,
        "notes": visit.notes,
        "created_by": visit.created_by,
    }


async def do_start_pauta(ctx: ToolContext, arguments: dict) -> dict[str, Any]:
    child_name: str = arguments["child_name"]
    medication: str = arguments["medication"]
    dose: str = arguments["dose"]
    interval: int = arguments["interval"]
    duration: int = arguments["duration"]
    result = await resolve_child_by_name(ctx.session, child_name)
    if isinstance(result, ChildMatchError):
        raise ToolError.child_match_error(result)
    child = result
    now = datetime.now(UTC)
    pauta = Pauta(
        family_id=ctx.family_id,
        child_id=child.id,
        medication=medication,
        dose=dose,
        interval_hours=interval,
        duration_days=duration,
        started_at=now,
        status="active",
        created_by=ctx.member_id,
        created_at=now,
    )
    ctx.session.add(pauta)
    await ctx.session.flush()
    await ctx.session.refresh(pauta)
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


async def do_record_administration(ctx: ToolContext, arguments: dict) -> dict[str, Any]:
    pauta_id: str = arguments["pauta_id"]
    try:
        pid = uuid.UUID(pauta_id)
    except ValueError as e:
        raise ToolError(
            {
                "error": "invalid_pauta_id",
                "message": f"pauta_id no es un UUID válido: {pauta_id}",
            }
        ) from e
    pauta = await ctx.session.get(Pauta, pid)
    if pauta is None:
        raise ToolError({"error": "not_found", "message": "Pauta no encontrada"})
    if pauta.status == "finished":
        raise ToolError({"error": "finished", "message": "La Pauta ya está finalizada"})

    now = datetime.now(UTC)
    window_start = now - timedelta(minutes=DUPLICATE_GUARD_MINUTES)
    existing = (
        await ctx.session.execute(
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
        family_id=ctx.family_id,
        pauta_id=pid,
        administered_at=now,
        administered_by=ctx.member_id,
    )
    ctx.session.add(admin)
    await ctx.session.flush()
    await ctx.session.refresh(admin)
    return {
        "id": str(admin.id),
        "pauta_id": str(admin.pauta_id),
        "administered_at": admin.administered_at.isoformat(),
        "administered_by": admin.administered_by,
        "duplicate": False,
    }


async def do_finish_pauta(ctx: ToolContext, arguments: dict) -> dict[str, Any]:
    pauta_id: str = arguments["pauta_id"]
    try:
        pid = uuid.UUID(pauta_id)
    except ValueError as e:
        raise ToolError(
            {
                "error": "invalid_pauta_id",
                "message": f"pauta_id no es un UUID válido: {pauta_id}",
            }
        ) from e
    pauta = await ctx.session.get(Pauta, pid)
    if pauta is None:
        raise ToolError({"error": "not_found", "message": "Pauta no encontrada"})
    if pauta.status == "finished":
        raise ToolError(
            {"error": "already_finished", "message": "La Pauta ya está finalizada"}
        )
    pauta.status = "finished"
    ctx.session.add(pauta)
    await ctx.session.flush()
    await ctx.session.refresh(pauta)
    return {
        "id": str(pauta.id),
        "status": pauta.status,
        "medication": pauta.medication,
    }


async def do_list_active_pautas(
    ctx: ToolContext, arguments: dict
) -> list[dict[str, Any]]:
    child_name: str | None = arguments.get("child_name")
    stmt = select(Pauta).where(Pauta.status == "active")
    if child_name is not None:
        result = await resolve_child_by_name(ctx.session, child_name)
        if isinstance(result, ChildMatchError):
            raise ToolError.child_match_error(result)
        stmt = stmt.where(Pauta.child_id == result.id)
    stmt = stmt.order_by(Pauta.started_at.desc())
    rows = (await ctx.session.execute(stmt)).scalars().all()
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


async def do_record_measurement(ctx: ToolContext, arguments: dict) -> dict:
    type_: str = arguments["type"]
    if type_ not in VALID_MEASUREMENT_TYPES:
        raise ToolError(
            {
                "error": "invalid_type",
                "message": f"type debe ser uno de {sorted(VALID_MEASUREMENT_TYPES)}",
                "valid_types": sorted(VALID_MEASUREMENT_TYPES),
            }
        )
    child_name: str = arguments["child_name"]
    value = float(arguments["value"])
    unit: str = arguments["unit"]
    child_or_err = await resolve_child_by_name(ctx.session, child_name)
    if isinstance(child_or_err, ChildMatchError):
        raise ToolError.child_match_error(child_or_err)

    measurement = Measurement(
        family_id=ctx.family_id,
        child_id=child_or_err.id,
        type=type_,
        value=value,
        unit=unit,
        measured_at=date.today(),
        recorded_by=ctx.member_id,
        created_at=datetime.now(UTC),
    )
    ctx.session.add(measurement)
    await ctx.session.flush()
    return {
        "id": str(measurement.id),
        "child_id": str(measurement.child_id),
        "type": measurement.type,
        "value": measurement.value,
        "unit": measurement.unit,
        "measured_at": str(measurement.measured_at),
    }


async def do_record_size(ctx: ToolContext, arguments: dict) -> dict:
    type_: str = arguments["type"]
    if type_ not in VALID_SIZE_TYPES:
        raise ToolError(
            {
                "error": "invalid_type",
                "message": f"type debe ser uno de {sorted(VALID_SIZE_TYPES)}",
                "valid_types": sorted(VALID_SIZE_TYPES),
            }
        )
    child_name: str = arguments["child_name"]
    label: str = arguments["label"]
    child_or_err = await resolve_child_by_name(ctx.session, child_name)
    if isinstance(child_or_err, ChildMatchError):
        raise ToolError.child_match_error(child_or_err)

    size = Size(
        family_id=ctx.family_id,
        child_id=child_or_err.id,
        type=type_,
        label=label,
        recorded_at=date.today(),
        recorded_by=ctx.member_id,
        created_at=datetime.now(UTC),
    )
    ctx.session.add(size)
    await ctx.session.flush()
    return {
        "id": str(size.id),
        "child_id": str(size.child_id),
        "type": size.type,
        "label": size.label,
        "recorded_at": str(size.recorded_at),
    }


async def do_list_event_types(
    ctx: ToolContext, arguments: dict
) -> list[dict[str, str]]:
    rows = (
        (await ctx.session.execute(select(EventType).order_by(EventType.name)))
        .scalars()
        .all()
    )
    return [{"id": str(et.id), "name": et.name, "icon": et.icon} for et in rows]


async def do_create_event(ctx: ToolContext, arguments: dict) -> dict[str, Any]:
    title: str = arguments["title"]
    type_name: str = arguments["type"]
    try:
        date_val = parse_flexible_date(arguments["date"])
    except DateParseError as e:
        raise ToolError({"error": "invalid_date", "message": str(e)}) from e
    time_val: time | None = None
    if arguments.get("time"):
        try:
            time_val = parse_flexible_time(arguments["time"])
        except DateParseError as e:
            raise ToolError({"error": "invalid_date", "message": str(e)}) from e
    child_name: str | None = arguments.get("child_name")

    # Resolver tipo: buscar por nombre case-insensitive; fallback a "Otros".
    matched_type = (
        (
            await ctx.session.execute(
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
                await ctx.session.execute(
                    select(EventType).where(func.lower(EventType.name) == "otros")
                )
            )
            .scalars()
            .first()
        )
    if matched_type is None:
        return {"error": "No se encontró el tipo 'Otros' en el sistema."}

    # Resolver child_name si se proporcionó. Se mantiene el contrato histórico de
    # create_event: un dict con `error` (texto humano con los nombres válidos)
    # para que el cliente pueda corregir. No se unifica a ToolError aquí porque
    # el test `test_create_event_child_not_found` codifica exactamente esa forma.
    child_id = None
    if child_name is not None:
        result = await resolve_child_by_name(ctx.session, child_name)
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
        family_id=ctx.family_id,
        child_id=child_id,
        title=title,
        event_type_id=matched_type.id,
        date=date_val,
        time=time_val,
        status="pending",
        created_by=ctx.member_id,
    )
    ctx.session.add(event)
    await ctx.session.flush()
    await ctx.session.refresh(event)

    return {
        "id": str(event.id),
        "title": event.title,
        "date": str(event.date),
        "time": str(event.time) if event.time else None,
        "type": matched_type.name,
        "child_id": str(event.child_id) if event.child_id else None,
        "status": event.status,
    }


# --- Registro de herramientas ------------------------------------------------
# Añadir una herramienta = añadir una entrada aquí. El dispatcher es agnóstico
# al nombre. (issue 01)
TOOL_HANDLERS: dict[str, Callable[[ToolContext, dict], Awaitable[Any]]] = {
    "list_children": do_list_children,
    "add_shopping_items": do_add_shopping_items,
    "record_health_visit": do_record_health_visit,
    "start_pauta": do_start_pauta,
    "record_administration": do_record_administration,
    "finish_pauta": do_finish_pauta,
    "list_active_pautas": do_list_active_pautas,
    "record_measurement": do_record_measurement,
    "record_size": do_record_size,
    "list_event_types": do_list_event_types,
    "create_event": do_create_event,
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
    """Resuelve la herramienta por registro y la ejecuta dentro del seam.

    No captura ToolError: el SDK del MCP lo propaga y produce un resultado
    isError=True cuyo content[0].text es el JSON canónico de ToolError.
    """
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        raise ToolError(
            {"error": "unknown_tool", "message": f"Herramienta no encontrada: {name}"}
        )
    async with tool_session() as ctx:
        res = await handler(ctx, arguments)
    return [TextContent(type="text", text=json.dumps(res, ensure_ascii=False))]


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
