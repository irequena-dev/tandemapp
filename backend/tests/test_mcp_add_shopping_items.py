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


@asynccontextmanager
async def _lifespan(app) -> AsyncIterator[None]:
    yield


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
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token(auth_client, identity, "org_shop_add", "user_shop_add")

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
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
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token_a = await _seed_token(
        auth_client, identity, "org_shop_iso_a", "user_shop_iso_a"
    )
    token_b = await _seed_token(
        auth_client, identity, "org_shop_iso_b", "user_shop_iso_b"
    )

    async with _lifespan(None):
        # Familia A añade ítems.
        async with mcp_client_factory(token_a) as c:
            await c.call_tool("add_shopping_items", {"items": ["leche A", "pan A"]})

        # Familia B añade ítems distintos.
        async with mcp_client_factory(token_b) as c:
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
    resp = await client.get(
        "/mcp/sse", headers={"Authorization": "Bearer tdm_live_bogus"}
    )
    assert resp.status_code == 401


# --- (d) tachar y limpiar NO están expuestos como herramientas MCP ---


async def test_no_toggle_or_clear_tools_exposed(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token(
        auth_client, identity, "org_shop_no_toggle", "user_shop_no_toggle"
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            tools = (await c.list_tools()).tools
            tool_names = [t.name for t in tools]

    forbidden = {"toggle_shopping_item", "clear_bought_items", "delete_shopping_item"}
    assert forbidden.isdisjoint(set(tool_names)), (
        f"Las herramientas {forbidden & set(tool_names)} no deben exponerse por MCP"
    )
