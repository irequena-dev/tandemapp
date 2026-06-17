"""Servidor MCP remoto de Tándem: herramientas expuestas bajo puerta Bearer.

El flujo es:
1. La app FastAPI monta en `/mcp` un ASGI wrapper (`with_bearer_auth`) que
   envuelve al `http_app()` de FastMCP.
2. El wrapper resuelve el `Authorization: Bearer` a (Miembro, Familia) vía
   `resolve_token` (SECURITY DEFINER; válido sin variable RLS). Si falla, corta
   con un 401 real ANTES de llegar a FastMCP.
3. La identidad resuelta se deposita en `scope["state"]`, de donde la lee la
   herramienta `list_children` a través de `get_http_request().scope`.
4. La herramienta abre su propia transacción y fija la variable RLS de la
   Familia antes de consultar.

Montaje: ver `app.main.create_app`.

Rate limiting estricto por token: es responsabilidad del proxy inverso (fuera
del código de la tool); ver ADR-0006 y PRD Fase 0.
"""

import json
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_request
from sqlalchemy import func, select, text

from ..database import get_sessionmaker
from ..models import (
    DUPLICATE_GUARD_MINUTES,
    Administration,
    Child,
    Event,
    EventType,
    HealthVisit,
    Pauta,
    ShoppingItem,
)
from ..tenancy import FAMILY_VAR
from .auth import extract_bearer, resolve_token
from .child_matching import ChildMatchError, resolve_child_by_name

# Clave bajo la que el wrapper deposita (member_id, family_id) en el scope ASGI.
MCP_IDENTITY_KEY = "tandem_mcp_identity"

mcp = FastMCP("Tándem")


@mcp.tool
async def list_children() -> list[dict[str, str]]:
    """Lista los Hijos de la Familia del token MCP (orden: nacimiento, nombre).

    La identidad (Miembro, Familia) llega desde la puerta Bearer a través de
    `scope["state"]` (mismo scope ASGI que muta el wrapper). Aquí abrimos una
    transacción propia y fijamos la variable RLS de la Familia antes de leer.
    """
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


@mcp.tool
async def add_shopping_items(items: list[str]) -> list[dict[str, str]]:
    """Añade varios Ítems de compra a la lista de la Familia del token MCP.

    Cada string se inserta como un Ítem en estado `pending`. Devuelve la lista
    de Ítems creados con su id, texto y estado.
    """
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


@mcp.tool
async def record_health_visit(
    child_name: str,
    visited_at: str,
    diagnosis: str,
    notes: str | None = None,
) -> dict[str, Any]:
    """Registra una Visita médica para un Hijo (historial de salud).

    `child_name` se resuelve por matching estricto (case-insensitive). Si no
    coincide, devuelve error estructurado con la lista de Hijos válidos.
    `visited_at` es la fecha de la visita (YYYY-MM-DD). `notes` es texto libre
    opcional (tratamiento, observaciones).
    """
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


@mcp.tool
async def start_pauta(
    child_name: str,
    medication: str,
    dose: str,
    interval: int,
    duration: int,
) -> dict[str, Any]:
    """Inicia una Pauta (tratamiento) para un Hijo.

    `child_name`: matching estricto. `medication`: nombre del medicamento.
    `dose`: cantidad (ej. "5 ml"). `interval`: horas entre tomas.
    `duration`: días de duración del tratamiento.
    """
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


@mcp.tool
async def record_administration(pauta_id: str) -> dict[str, Any]:
    """Registra que se ha dado una dosis de una Pauta (Administración).

    Guarda de duplicado: si ya existe una Administración de la misma Pauta
    dentro de la ventana corta (~15 min), no crea otra y devuelve la existente.
    La Administración se atribuye al Miembro del token MCP.
    """
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


@mcp.tool
async def finish_pauta(pauta_id: str) -> dict[str, Any]:
    """Finaliza manualmente una Pauta activa (cortar el tratamiento).

    Devuelve error estructurado si la Pauta no existe o ya está finalizada.
    """
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


@mcp.tool
async def list_active_pautas(child_name: str | None = None) -> list[dict[str, Any]]:
    """Lista las Pautas activas de la Familia (lectura mínima).

    Filtrable por `child_name` (matching estricto). Devuelve solo Pautas con
    status=active para que el cliente MCP elija la correcta antes de
    registrar una Administración o finalizar.
    """
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


@mcp.tool
async def list_event_types() -> list[dict[str, str]]:
    """Lista los Tipos de Evento visibles: base del sistema + propios de la Familia.

    Lectura mínima para que la IA elija un tipo válido al crear un Evento.
    """
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


@mcp.tool
async def create_event(
    title: str,
    date: date,
    type: str,
    time: time | None = None,
    child_name: str | None = None,
) -> dict[str, str | None]:
    """Crea un Evento suelto en la agenda de la Familia.

    - `type`: nombre del Tipo de Evento; si no encaja con ninguno existente se
      usa "Otros" (fallback).
    - `child_name`: nombre exacto del Hijo (opcional); matching estricto.
    - No se permite recurrencia por voz (las Series son solo PWA).
    """
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
                            func.lower(EventType.name) == func.lower(type)
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
                date=date,
                time=time,
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


async def _unauthorized(send, detail: str = "Token MCP inválido o revocado") -> None:
    """Respuesta HTTP 401 real (sin delegar a FastMCP)."""
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
    """Envuelve la app MCP exigiendo un Bearer válido; 401 real si no aplica.

    Pasa de largo los mensajes no-HTTP (lifespan, websocket). Resuelve el token
    vía la función SECURITY DEFINER (no requiere variable RLS) y, si es válido,
    deposita la identidad en `scope["state"]` para que la herramienta la lea.
    """

    async def asgi(scope, receive, send):
        if scope["type"] != "http":
            await mcp_app(scope, receive, send)
            return

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        bearer = extract_bearer(headers)
        identity = None
        if bearer:
            async with get_sessionmaker()() as session:
                identity = await resolve_token(session, bearer)
        if identity is None:
            return await _unauthorized(send)
        scope.setdefault("state", {})[MCP_IDENTITY_KEY] = identity
        await mcp_app(scope, receive, send)

    return asgi


def build_mcp_app() -> tuple[Any, Any]:
    """Construye la app MCP con puerta Bearer; devuelve (asgi_gated, lifespan).

    El `lifespan` debe pasarse a `FastAPI(...)` para que el gestor de sesiones
    de FastMCP arranque/detenga correctamente.
    """
    mcp_app = mcp.http_app(path="/")
    gated = with_bearer_auth(mcp_app)
    return gated, mcp_app.lifespan
