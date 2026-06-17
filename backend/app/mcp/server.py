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
from datetime import UTC, date, datetime
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_request
from sqlalchemy import select, text

from ..database import get_sessionmaker
from ..models import Child, Measurement, Size
from ..tenancy import FAMILY_VAR
from .auth import extract_bearer, resolve_token
from .child_matching import ChildMatchError, resolve_child_by_name

# Conjuntos curados de tipos válidos (la IA no inventa tipos).
VALID_MEASUREMENT_TYPES = frozenset({"height", "weight"})
VALID_SIZE_TYPES = frozenset({"clothing", "footwear"})

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


def _child_error_payload(match_error: ChildMatchError) -> dict:
    """Error estructurado de resolución de Hijo para la superficie MCP."""
    reason_key = (
        "child_not_found" if match_error.reason == "not_found" else "child_ambiguous"
    )
    return {
        "error": reason_key,
        "valid_children": [
            {"id": str(c.id), "name": c.name, "birth_date": str(c.birth_date)}
            for c in match_error.valid_children
        ],
    }


@mcp.tool
async def record_measurement(
    child_name: str, type: str, value: float, unit: str
) -> dict:
    """Registra una Medida (height/weight) para un Hijo de la Familia.

    `type` debe ser 'height' o 'weight'. `child_name` se resuelve por matching
    estricto (case-insensitive). Si el tipo es inválido o el Hijo no se
    encuentra/es ambiguo, devuelve un error estructurado.
    """
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
                raise ValueError(json.dumps(_child_error_payload(child_or_err)))

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


@mcp.tool
async def record_size(child_name: str, type: str, label: str) -> dict:
    """Registra una Talla (clothing/footwear) para un Hijo de la Familia.

    `type` debe ser 'clothing' o 'footwear'. `child_name` se resuelve por
    matching estricto (case-insensitive). Si el tipo es inválido o el Hijo no se
    encuentra/es ambiguo, devuelve un error estructurado.
    """
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
                raise ValueError(json.dumps(_child_error_payload(child_or_err)))

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
