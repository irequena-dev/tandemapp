"""Tests de la herramienta MCP `add_shopping_items` (issue 04, Fase 1).

Costura: auth Bearer → inserción en `pending` → aislamiento entre Familias.
Postgres real (testcontainers), sin mocks.
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


def _asgi_factory(app):
    from httpx import ASGITransport, AsyncClient

    def factory(headers=None, timeout=None, auth=None, **_):
        kwargs: dict = {"transport": ASGITransport(app=app), "follow_redirects": True}
        if headers is not None:
            kwargs["headers"] = headers
        if auth is not None:
            kwargs["auth"] = auth
        return AsyncClient(**kwargs)

    return factory


@asynccontextmanager
async def _lifespan(app) -> AsyncIterator[None]:
    import asyncio

    queue: asyncio.Queue = asyncio.Queue()
    started = asyncio.Event()

    async def receive():
        return await queue.get()

    async def send(message):
        if message["type"] == "lifespan.startup.failed":
            raise RuntimeError(f"Startup falló: {message.get('message')}")
        if message["type"] == "lifespan.startup.complete":
            started.set()

    task = asyncio.create_task(  # noqa: RUF006
        app({"type": "lifespan"}, receive, send)
    )
    try:
        await queue.put({"type": "lifespan", "message": "lifespan.startup"})
        await asyncio.wait_for(started.wait(), timeout=5)
        yield
    finally:
        await queue.put({"type": "lifespan", "message": "lifespan.shutdown"})
        try:
            await asyncio.wait_for(task, timeout=5)
        except (TimeoutError, asyncio.CancelledError):
            task.cancel()


async def _seed_token(
    auth_client: AsyncClient, identity: dict, org_id: str, user_id: str
) -> str:
    """Genera un token MCP para el Miembro dado; devuelve el token en claro."""
    _as(identity, org_id, user_id)
    return (await auth_client.post("/mcp-tokens")).json()["token"]


def _tool_result(result) -> list | dict | str:
    """Extrae el payload del resultado de una herramienta MCP."""
    data = getattr(result, "data", None)
    if data is not None:
        return data
    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text:
            payload = json.loads(text)
            if isinstance(payload, dict) and "result" in payload:
                return payload["result"]
            return payload
    return []


# --- (a) add_shopping_items inserta Ítems en `pending` bajo la Familia del token ---


async def test_add_shopping_items_inserts_pending_items(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token(auth_client, identity, "org_shop_add", "user_shop_add")

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = await c.call_tool(
                "add_shopping_items", {"items": ["pañales talla 4", "leche", "pan"]}
            )
            data = _tool_result(result)

    assert isinstance(data, list)
    assert len(data) == 3
    texts = [item["text"] for item in data]
    assert texts == ["pañales talla 4", "leche", "pan"]
    for item in data:
        assert item["status"] == "pending"

    # Verificar que aparecen via REST en la misma Familia.
    _as(identity, "org_shop_add", "user_shop_add")
    resp = await auth_client.get("/api/shopping-items")
    assert resp.status_code == 200
    items = resp.json()
    item_texts = [i["text"] for i in items if i["status"] == "pending"]
    assert "pañales talla 4" in item_texts
    assert "leche" in item_texts
    assert "pan" in item_texts


# --- (b) aislamiento: Ítems de una Familia NO aparecen en otra ---


async def test_add_shopping_items_isolation_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token_a = await _seed_token(
        auth_client, identity, "org_shop_iso_a", "user_shop_iso_a"
    )
    token_b = await _seed_token(
        auth_client, identity, "org_shop_iso_b", "user_shop_iso_b"
    )

    async with _lifespan(app):
        # Familia A añade ítems.
        tr_a = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_a}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_a) as c:
            await c.call_tool("add_shopping_items", {"items": ["leche A", "pan A"]})

        # Familia B añade ítems distintos.
        tr_b = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_b}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_b) as c:
            await c.call_tool("add_shopping_items", {"items": ["agua B"]})

    # REST: Familia A solo ve los suyos.
    _as(identity, "org_shop_iso_a", "user_shop_iso_a")
    resp_a = await auth_client.get("/api/shopping-items")
    texts_a = [i["text"] for i in resp_a.json()]
    assert "leche A" in texts_a
    assert "pan A" in texts_a
    assert "agua B" not in texts_a

    # REST: Familia B solo ve los suyos.
    _as(identity, "org_shop_iso_b", "user_shop_iso_b")
    resp_b = await auth_client.get("/api/shopping-items")
    texts_b = [i["text"] for i in resp_b.json()]
    assert "agua B" in texts_b
    assert "leche A" not in texts_b


# --- (c) Bearer inválido → rechazado (el wrapper ya aplica 401, issue 05) ---


async def test_add_shopping_items_rejects_invalid_bearer(
    client: AsyncClient,
) -> None:
    resp = await client.post(
        "/mcp/", headers={"Authorization": "Bearer tdm_live_bogus"}
    )
    assert resp.status_code == 401


# --- (d) tachar y limpiar NO están expuestos como herramientas MCP ---


async def test_no_toggle_or_clear_tools_exposed(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token(
        auth_client, identity, "org_shop_no_toggle", "user_shop_no_toggle"
    )

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            tools = await c.list_tools()
            tool_names = [t.name for t in tools]

    forbidden = {"toggle_shopping_item", "clear_bought_items", "delete_shopping_item"}
    assert forbidden.isdisjoint(set(tool_names)), (
        f"Las herramientas {forbidden & set(tool_names)} no deben exponerse por MCP"
    )
