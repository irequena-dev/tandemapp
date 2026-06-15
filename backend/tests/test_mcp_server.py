"""Tests del servidor MCP remoto (issue 05): puerta Bearer 401 + list_children.

Strict vertical TDD: tracer bullet primero, luego cada comportamiento.
Postgres real (testcontainers), sin mocks.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


def _asgi_factory(app):
    """httpx_client_factory que enruta a la app ASGI en proceso (sin red)."""
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
    """Dispara el lifespan ASGI (necesario para que FastMCP arranque sus sesiones).

    httpx.ASGITransport NO ejecuta lifespan, así que lo emulamos a mano enviando
    los eventos startup/shutdown al canal lifespan de la app.
    """
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


async def _seed_token_and_children(
    auth_client: AsyncClient,
    identity: dict,
    org_id: str,
    user_id: str,
    children: list[tuple[str, str]],
) -> str:
    """Genera un token MCP y da de alta Hijos en la Familia dada.

    Devuelve el token MCP en claro.
    """
    _as(identity, org_id, user_id)
    token = (await auth_client.post("/mcp-tokens")).json()["token"]
    for name, birth in children:
        resp = await auth_client.post(
            "/children", json={"name": name, "birth_date": birth}
        )
        assert resp.status_code == 201, resp.text
    return token


# --- Tracer bullet: happy path para validar montaje + propagación de identidad ---


async def test_tracer_bullet_valid_bearer_lists_children(
    auth_client: AsyncClient, identity: dict, client: AsyncClient
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_tracer",
        "user_mcp_tracer",
        [("Tracer Uno", "2020-01-01"), ("Tracer Dos", "2021-06-15")],
    )

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = await c.call_tool("list_children", {})
            names = _tool_names(result)

    assert sorted(names) == ["Tracer Dos", "Tracer Uno"]


def _tool_names(result) -> list[str]:
    """Nombres de Hijos del resultado de list_children (robusto al formato)."""
    # FastMCP puede devolver datos estructurados (.data) o contenido serializado.
    data = getattr(result, "data", None)
    if isinstance(data, list):
        return [d["name"] for d in data]
    # Fallback: parsear el contenido textual.
    import json

    for item in getattr(result, "content", []) or []:
        text = getattr(item, "text", None)
        if text:
            payload = json.loads(text)
            if isinstance(payload, list):
                return [d["name"] for d in payload]
            if isinstance(payload, dict) and "result" in payload:
                return [d["name"] for d in payload["result"]]
    return []


# --- Comportamiento (a): falta la cabecera Authorization → 401 real ---


async def test_missing_authorization_header_is_unauthorized(
    client: AsyncClient,
) -> None:
    resp = await client.post("/mcp/")
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


# --- Comportamiento (b): Bearer inválido → 401 ---


async def test_invalid_bearer_is_unauthorized(client: AsyncClient) -> None:
    resp = await client.post(
        "/mcp/", headers={"Authorization": "Bearer tdm_live_unknown"}
    )
    assert resp.status_code == 401


# --- Comportamiento (c): Bearer revocado → 401 ---


async def test_revoked_bearer_is_unauthorized(
    auth_client: AsyncClient, identity: dict, client: AsyncClient
) -> None:
    _as(identity, "org_mcp_revoke", "user_mcp_revoke")
    created = (await auth_client.post("/mcp-tokens")).json()
    token = created["token"]
    token_id = created["id"]

    revoked = await auth_client.delete(f"/mcp-tokens/{token_id}")
    assert revoked.status_code == 204

    resp = await client.post("/mcp/", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


# --- Comportamiento (d): Bearer válido → list_children devuelve EXACTAMENTE
#     los Hijos de esa Familia, en el orden (nacimiento, nombre) ---


async def test_valid_bearer_lists_only_that_family_children(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_valid",
        "user_mcp_valid",
        [
            ("Ben", "2020-03-10"),  # más joven
            ("Ada", "2019-12-01"),  # mayor → primero
            ("Ada2", "2019-12-01"),  # misma fecha, nombre detrás
        ],
    )

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = await c.call_tool("list_children", {})
            names = _tool_names(result)

    # Exactamente esos tres, en orden (nacimiento asc, luego nombre asc).
    assert names == ["Ada", "Ada2", "Ben"]


# --- Comportamiento (e): aislamiento entre Familias vía token MCP ---


async def test_token_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    # Familia A: token + 2 Hijos.
    token_a = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_a",
        "user_mcp_a",
        [("A1", "2020-01-01"), ("A2", "2021-01-01")],
    )
    # Familia B: token + 1 Hijo distinto.
    token_b = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_b",
        "user_mcp_b",
        [("B1", "2020-06-01")],
    )

    async with _lifespan(app):
        # El token de A solo ve los Hijos de A.
        tr_a = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_a}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_a) as c:
            names_a = _tool_names(await c.call_tool("list_children", {}))

        # El token de B solo ve los Hijos de B.
        tr_b = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_b}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_b) as c:
            names_b = _tool_names(await c.call_tool("list_children", {}))

    assert sorted(names_a) == ["A1", "A2"]
    assert names_b == ["B1"]
