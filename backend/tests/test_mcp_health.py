"""Tests de las herramientas MCP de Salud (Fase 3, issue 05).

Costura: record_health_visit, start_pauta, record_administration (guarda de
duplicado), finish_pauta, list_active_pautas. Matching estricto de Hijo,
aislamiento por Familia, atribución al Miembro del token.

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


async def _seed_token_and_children(
    auth_client: AsyncClient,
    identity: dict,
    org_id: str,
    user_id: str,
    children: list[tuple[str, str]],
) -> str:
    _as(identity, org_id, user_id)
    token = (await auth_client.post("/mcp-tokens")).json()["token"]
    for name, birth in children:
        resp = await auth_client.post(
            "/children", json={"name": name, "birth_date": birth}
        )
        assert resp.status_code == 201, resp.text
    return token


def _tool_result(result) -> dict | list:
    """Extrae el payload de un resultado de herramienta MCP."""
    data = getattr(result, "data", None)
    if isinstance(data, (dict, list)):
        return data
    for item in getattr(result, "content", []) or []:
        txt = getattr(item, "text", None)
        if txt:
            payload = json.loads(txt)
            if isinstance(payload, dict) and "result" in payload:
                return payload["result"]
            return payload
    return {}


# ---------- record_health_visit ----------


async def test_record_health_visit_happy_path(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_hv1", "user_hv1", [("Lucía", "2020-03-10")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            res = _tool_result(
                await c.call_tool(
                    "record_health_visit",
                    {
                        "child_name": "Lucía",
                        "visited_at": "2026-06-10",
                        "diagnosis": "Otitis media",
                        "notes": "Recetado amoxicilina",
                    },
                )
            )
    assert res["diagnosis"] == "Otitis media"
    assert res["visited_at"] == "2026-06-10"
    assert res["notes"] == "Recetado amoxicilina"
    assert res["created_by"] == "user_hv1"


async def test_record_health_visit_strict_matching_not_found(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_hv2", "user_hv2", [("Marcos", "2021-01-15")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            res = _tool_result(
                await c.call_tool(
                    "record_health_visit",
                    {
                        "child_name": "Desconocido",
                        "visited_at": "2026-06-10",
                        "diagnosis": "Fiebre",
                    },
                )
            )
    assert res["error"] == "not_found"
    assert len(res["valid_children"]) == 1
    assert res["valid_children"][0]["name"] == "Marcos"


# ---------- start_pauta ----------


async def test_start_pauta_happy_path(auth_client: AsyncClient, identity: dict) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_sp1", "user_sp1", [("Elena", "2019-05-20")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            res = _tool_result(
                await c.call_tool(
                    "start_pauta",
                    {
                        "child_name": "Elena",
                        "medication": "Ibuprofeno",
                        "dose": "5 ml",
                        "interval": 8,
                        "duration": 3,
                    },
                )
            )
    assert res["medication"] == "Ibuprofeno"
    assert res["dose"] == "5 ml"
    assert res["interval_hours"] == 8
    assert res["duration_days"] == 3
    assert res["status"] == "active"


async def test_start_pauta_strict_matching_not_found(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_sp2", "user_sp2", [("Pablo", "2020-07-01")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            res = _tool_result(
                await c.call_tool(
                    "start_pauta",
                    {
                        "child_name": "Inexistente",
                        "medication": "Dalsy",
                        "dose": "3 ml",
                        "interval": 6,
                        "duration": 5,
                    },
                )
            )
    assert res["error"] == "not_found"
    assert res["valid_children"][0]["name"] == "Pablo"


# ---------- record_administration + guarda de duplicado ----------


async def test_record_administration_and_duplicate_guard(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_ra1", "user_ra1", [("Sofía", "2021-02-14")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            pauta_res = _tool_result(
                await c.call_tool(
                    "start_pauta",
                    {
                        "child_name": "Sofía",
                        "medication": "Amoxicilina",
                        "dose": "5 ml",
                        "interval": 8,
                        "duration": 7,
                    },
                )
            )
            pauta_id = pauta_res["id"]

            # Primera Administración: crea nueva.
            admin1 = _tool_result(
                await c.call_tool("record_administration", {"pauta_id": pauta_id})
            )
            assert admin1["duplicate"] is False
            assert admin1["administered_by"] == "user_ra1"

            # Segunda inmediata: guarda de duplicado activa.
            admin2 = _tool_result(
                await c.call_tool("record_administration", {"pauta_id": pauta_id})
            )
            assert admin2["duplicate"] is True
            assert admin2["id"] == admin1["id"]


async def test_record_administration_pauta_not_found(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_ra2", "user_ra2", [("Leo", "2022-01-01")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            res = _tool_result(
                await c.call_tool(
                    "record_administration",
                    {"pauta_id": "00000000-0000-0000-0000-000000000000"},
                )
            )
    assert res["error"] == "not_found"


async def test_record_administration_pauta_finished(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_ra3", "user_ra3", [("Hugo", "2020-09-05")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            pauta_res = _tool_result(
                await c.call_tool(
                    "start_pauta",
                    {
                        "child_name": "Hugo",
                        "medication": "Paracetamol",
                        "dose": "2.5 ml",
                        "interval": 6,
                        "duration": 2,
                    },
                )
            )
            pauta_id = pauta_res["id"]

            await c.call_tool("finish_pauta", {"pauta_id": pauta_id})

            res = _tool_result(
                await c.call_tool("record_administration", {"pauta_id": pauta_id})
            )
    assert res["error"] == "finished"


# ---------- finish_pauta ----------


async def test_finish_pauta_happy_path(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_fp1", "user_fp1", [("Noa", "2019-11-30")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            pauta_res = _tool_result(
                await c.call_tool(
                    "start_pauta",
                    {
                        "child_name": "Noa",
                        "medication": "Dalsy",
                        "dose": "3 ml",
                        "interval": 8,
                        "duration": 5,
                    },
                )
            )
            pauta_id = pauta_res["id"]

            res = _tool_result(
                await c.call_tool("finish_pauta", {"pauta_id": pauta_id})
            )
    assert res["status"] == "finished"
    assert res["medication"] == "Dalsy"


async def test_finish_pauta_already_finished(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_fp2", "user_fp2", [("Vega", "2020-04-22")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            pauta_res = _tool_result(
                await c.call_tool(
                    "start_pauta",
                    {
                        "child_name": "Vega",
                        "medication": "Augmentine",
                        "dose": "5 ml",
                        "interval": 12,
                        "duration": 7,
                    },
                )
            )
            pauta_id = pauta_res["id"]
            await c.call_tool("finish_pauta", {"pauta_id": pauta_id})

            res = _tool_result(
                await c.call_tool("finish_pauta", {"pauta_id": pauta_id})
            )
    assert res["error"] == "already_finished"


# ---------- list_active_pautas ----------


async def test_list_active_pautas_all(auth_client: AsyncClient, identity: dict) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_lap1",
        "user_lap1",
        [("Aitana", "2020-01-01"), ("Liam", "2021-06-15")],
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            await c.call_tool(
                "start_pauta",
                {
                    "child_name": "Aitana",
                    "medication": "Ibuprofeno",
                    "dose": "5 ml",
                    "interval": 8,
                    "duration": 3,
                },
            )
            await c.call_tool(
                "start_pauta",
                {
                    "child_name": "Liam",
                    "medication": "Dalsy",
                    "dose": "3 ml",
                    "interval": 6,
                    "duration": 5,
                },
            )

            res = _tool_result(await c.call_tool("list_active_pautas", {}))
    assert isinstance(res, list)
    assert len(res) == 2
    meds = {p["medication"] for p in res}
    assert meds == {"Ibuprofeno", "Dalsy"}


async def test_list_active_pautas_filtered_by_child(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_lap2",
        "user_lap2",
        [("Candela", "2019-03-10"), ("Mateo", "2020-09-01")],
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            await c.call_tool(
                "start_pauta",
                {
                    "child_name": "Candela",
                    "medication": "Amoxicilina",
                    "dose": "5 ml",
                    "interval": 8,
                    "duration": 7,
                },
            )
            await c.call_tool(
                "start_pauta",
                {
                    "child_name": "Mateo",
                    "medication": "Dalsy",
                    "dose": "3 ml",
                    "interval": 6,
                    "duration": 5,
                },
            )

            res = _tool_result(
                await c.call_tool("list_active_pautas", {"child_name": "Candela"})
            )
    assert isinstance(res, list)
    assert len(res) == 1
    assert res[0]["medication"] == "Amoxicilina"


async def test_list_active_pautas_excludes_finished(
    auth_client: AsyncClient, identity: dict
) -> None:
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token = await _seed_token_and_children(
        auth_client, identity, "org_lap3", "user_lap3", [("Alma", "2021-02-28")]
    )
    transport = StreamableHttpTransport(
        "http://test/mcp",
        headers={"Authorization": f"Bearer {token}"},
        httpx_client_factory=_asgi_factory(app),
    )
    async with _lifespan(app):
        async with Client(transport=transport) as c:
            pauta_res = _tool_result(
                await c.call_tool(
                    "start_pauta",
                    {
                        "child_name": "Alma",
                        "medication": "Paracetamol",
                        "dose": "2 ml",
                        "interval": 6,
                        "duration": 2,
                    },
                )
            )
            await c.call_tool("finish_pauta", {"pauta_id": pauta_res["id"]})

            res = _tool_result(await c.call_tool("list_active_pautas", {}))
    assert isinstance(res, list)
    assert len(res) == 0


# ---------- Aislamiento por Familia ----------


async def test_tools_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Las herramientas MCP de salud respetan el aislamiento por Familia."""
    from fastmcp import Client
    from fastmcp.client.transports import StreamableHttpTransport

    from app.main import app

    token_a = await _seed_token_and_children(
        auth_client, identity, "org_iso1", "user_iso1", [("Hijo_A", "2020-01-01")]
    )
    token_b = await _seed_token_and_children(
        auth_client, identity, "org_iso2", "user_iso2", [("Hijo_B", "2021-01-01")]
    )

    async with _lifespan(app):
        tr_a = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_a}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_a) as c:
            await c.call_tool(
                "start_pauta",
                {
                    "child_name": "Hijo_A",
                    "medication": "Med_A",
                    "dose": "5 ml",
                    "interval": 8,
                    "duration": 3,
                },
            )

        tr_b = StreamableHttpTransport(
            "http://test/mcp",
            headers={"Authorization": f"Bearer {token_b}"},
            httpx_client_factory=_asgi_factory(app),
        )
        async with Client(transport=tr_b) as c:
            # Familia B solo ve sus Pautas, no las de A.
            res = _tool_result(await c.call_tool("list_active_pautas", {}))

    assert isinstance(res, list)
    assert len(res) == 0
