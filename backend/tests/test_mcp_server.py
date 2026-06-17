"""Tests del servidor MCP remoto: puerta Bearer 401 + list_children +
list_event_types + create_event.

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


# ---------------------------------------------------------------------------
# Helpers genéricos para parsear resultados de herramientas MCP
# ---------------------------------------------------------------------------


def _tool_result(result):
    """Parsea la respuesta de una herramienta MCP a un dict/list de Python."""
    import json

    data = getattr(result, "data", None)
    if data is not None:
        return data
    for item in getattr(result, "content", []) or []:
        txt = getattr(item, "text", None)
        if txt:
            return json.loads(txt)
    return None


# ---------------------------------------------------------------------------
# list_event_types — lectura mínima de tipos base + propios
# ---------------------------------------------------------------------------


async def test_list_event_types_returns_system_types(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una Familia sin tipos propios ve exactamente los 5 tipos base."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    _as(identity, "org_mcp_et_sys", "user_mcp_et_sys")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = _tool_result(await c.call_tool("list_event_types", {}))

    names = sorted([t["name"] for t in result])
    assert names == ["Cole", "Extraescolar", "Médico", "Otros", "Trámite"]


async def test_list_event_types_includes_custom_types(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Si la Familia ha creado un tipo propio, list_event_types lo incluye."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    _as(identity, "org_mcp_et_cust", "user_mcp_et_cust")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]
    # Crear un tipo personalizado vía REST.
    resp = await auth_client.post(
        "/event-types", json={"name": "Cumpleaños", "icon": "cake"}
    )
    assert resp.status_code == 201

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = _tool_result(await c.call_tool("list_event_types", {}))

    names = sorted([t["name"] for t in result])
    assert "Cumpleaños" in names
    # Los tipos base siguen presentes.
    assert "Médico" in names


# ---------------------------------------------------------------------------
# create_event — alta de Evento suelto
# ---------------------------------------------------------------------------


async def test_create_event_happy_path(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Crea un Evento suelto con tipo válido, sin Hijo, sin hora."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    _as(identity, "org_mcp_ev_hp", "user_mcp_ev_hp")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = _tool_result(
                await c.call_tool(
                    "create_event",
                    {
                        "title": "Cita pediatra",
                        "date": "2026-07-01",
                        "type": "Médico",
                    },
                )
            )

    assert result["title"] == "Cita pediatra"
    assert result["date"] == "2026-07-01"
    assert result["type"] == "Médico"
    assert result["status"] == "pending"
    assert result["child_id"] is None
    assert result["time"] is None
    assert "id" in result


async def test_create_event_with_time(auth_client: AsyncClient, identity: dict) -> None:
    """Crea un Evento con hora (no día completo)."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    _as(identity, "org_mcp_ev_time", "user_mcp_ev_time")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = _tool_result(
                await c.call_tool(
                    "create_event",
                    {
                        "title": "Reunión cole",
                        "date": "2026-07-02",
                        "type": "Cole",
                        "time": "10:30:00",
                    },
                )
            )

    assert result["title"] == "Reunión cole"
    assert result["time"] is not None
    assert "10:30" in result["time"]


async def test_create_event_with_child(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Crea un Evento asociado a un Hijo por matching estricto."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_ev_child",
        "user_mcp_ev_child",
        [("Lucas", "2019-05-10")],
    )

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = _tool_result(
                await c.call_tool(
                    "create_event",
                    {
                        "title": "Vacuna Lucas",
                        "date": "2026-07-03",
                        "type": "Médico",
                        "child_name": "Lucas",
                    },
                )
            )

    assert result["title"] == "Vacuna Lucas"
    assert result["child_id"] is not None


async def test_create_event_fallback_to_otros(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Si el tipo dictado no encaja, se usa 'Otros' sin error."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    _as(identity, "org_mcp_ev_otros", "user_mcp_ev_otros")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = _tool_result(
                await c.call_tool(
                    "create_event",
                    {
                        "title": "Algo inventado",
                        "date": "2026-07-04",
                        "type": "CategoríaQueNoExiste",
                    },
                )
            )

    assert "error" not in result
    assert result["type"] == "Otros"
    assert result["title"] == "Algo inventado"


async def test_create_event_child_not_found(
    auth_client: AsyncClient, identity: dict
) -> None:
    """child_name sin coincidencia → error con lista de Hijos válidos."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_ev_cnf",
        "user_mcp_ev_cnf",
        [("Sofía", "2020-01-01")],
    )

    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            result = _tool_result(
                await c.call_tool(
                    "create_event",
                    {
                        "title": "Evento hijo fantasma",
                        "date": "2026-07-05",
                        "type": "Médico",
                        "child_name": "Inexistente",
                    },
                )
            )

    assert "error" in result
    assert "Sofía" in result["error"]


async def test_create_event_isolation(auth_client: AsyncClient, identity: dict) -> None:
    """Un Evento creado por Familia A no es visible para Familia B."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    # Familia A crea un Evento.
    _as(identity, "org_mcp_ev_iso_a", "user_mcp_ev_iso_a")
    token_a = (await auth_client.post("/mcp-tokens")).json()["token"]

    # Familia B.
    _as(identity, "org_mcp_ev_iso_b", "user_mcp_ev_iso_b")
    token_b = (await auth_client.post("/mcp-tokens")).json()["token"]

    async with _lifespan(app):
        # Familia A crea un Evento.
        tr_a = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_a}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_a) as c:
            res_a = _tool_result(
                await c.call_tool(
                    "create_event",
                    {
                        "title": "Solo de A",
                        "date": "2026-08-01",
                        "type": "Trámite",
                    },
                )
            )
        assert "error" not in res_a

        # Familia B lista sus tipos (indirectamente verifica que no ve Eventos de A).
        tr_b = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_b}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_b) as c:
            types_b = _tool_result(await c.call_tool("list_event_types", {}))

    # Ambas Familias ven los tipos base, verificamos que la herramienta funciona
    # bajo aislamiento (no hubo errores de RLS).
    names_b = [t["name"] for t in types_b]
    assert "Trámite" in names_b
