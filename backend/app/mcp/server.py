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
from datetime import UTC, datetime
from typing import Any

from fastmcp import FastMCP
from fastmcp.server.dependencies import get_http_request
from sqlalchemy import select, text

from ..database import get_sessionmaker
from ..models import Child, ShoppingItem
from ..tenancy import FAMILY_VAR
from .auth import extract_bearer, resolve_token

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
