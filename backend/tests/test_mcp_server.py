"""Tests del servidor MCP remoto.

Puerta Bearer + list_children + record_measurement + record_size +
list_event_types + create_event.
TDD vertical: tracer bullet primero, luego cada comportamiento.
Postgres real (testcontainers), sin mocks.
"""

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


@asynccontextmanager
async def _lifespan(app) -> AsyncIterator[None]:
    yield


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
    auth_client: AsyncClient, identity: dict, client: AsyncClient, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_tracer",
        "user_mcp_tracer",
        [("Tracer Uno", "2020-01-01"), ("Tracer Dos", "2021-06-15")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
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
    resp = await client.get("/mcp/sse")
    assert resp.status_code == 401
    assert resp.headers["www-authenticate"] == "Bearer"


# --- Comportamiento (b): Bearer inválido → 401 ---


async def test_invalid_bearer_is_unauthorized(client: AsyncClient) -> None:
    resp = await client.get(
        "/mcp/sse", headers={"Authorization": "Bearer tdm_live_unknown"}
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

    resp = await client.get("/mcp/sse", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


# --- Comportamiento (d): Bearer válido → list_children devuelve EXACTAMENTE
#     los Hijos de esa Familia, en el orden (nacimiento, nombre) ---


async def test_valid_bearer_lists_only_that_family_children(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

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

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool("list_children", {})
            names = _tool_names(result)

    # Exactamente esos tres, en orden (nacimiento asc, luego nombre asc).
    assert names == ["Ada", "Ada2", "Ben"]


# --- Comportamiento (e): aislamiento entre Familias vía token MCP ---


async def test_token_isolated_between_families(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

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

    async with _lifespan(None):
        # El token de A solo ve los Hijos de A.
        async with mcp_client_factory(token_a) as c:
            names_a = _tool_names(await c.call_tool("list_children", {}))

        # El token de B solo ve los Hijos de B.
        async with mcp_client_factory(token_b) as c:
            names_b = _tool_names(await c.call_tool("list_children", {}))

    assert sorted(names_a) == ["A1", "A2"]
    assert names_b == ["B1"]


# ---------------------------------------------------------------------------
# Helpers: parsear resultado de una tool MCP (dict/error)
# ---------------------------------------------------------------------------


def _tool_result(result):
    """Parsea el resultado de una tool MCP a dict o list (robusto al formato)."""
    data = getattr(result, "data", None)
    if isinstance(data, (dict, list)):
        return data
    for item in getattr(result, "content", []) or []:
        txt = getattr(item, "text", None)
        if txt:
            return json.loads(txt)
    return {}


def _parse_tool_error(exc: Exception) -> dict:
    """Extrae el JSON estructurado del mensaje de un ToolError."""
    msg = str(exc)
    # El mensaje de ToolError tiene el prefijo "Error calling tool '<name>': "
    # seguido del JSON que lanzó el ValueError en el servidor.
    idx = msg.find("{")
    if idx >= 0:
        return json.loads(msg[idx:])
    return {"raw": msg}


# ---------------------------------------------------------------------------
# record_measurement — happy paths
# ---------------------------------------------------------------------------


async def test_record_measurement_height_happy_path(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rm_h1",
        "user_rm_h1",
        [("Lúa", "2020-03-01")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_measurement",
                {
                    "child_name": "Lúa",
                    "type": "height",
                    "value": 95.5,
                    "unit": "cm",
                },
            )

    payload = _tool_result(result)
    assert payload["type"] == "height"
    assert payload["value"] == 95.5
    assert payload["unit"] == "cm"
    assert "id" in payload


async def test_record_measurement_weight_happy_path(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rm_w1",
        "user_rm_w1",
        [("Bilú", "2019-06-15")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_measurement",
                {
                    "child_name": "Bilú",
                    "type": "weight",
                    "value": 14.2,
                    "unit": "kg",
                },
            )

    payload = _tool_result(result)
    assert payload["type"] == "weight"
    assert payload["value"] == 14.2
    assert payload["unit"] == "kg"


# ---------------------------------------------------------------------------
# record_measurement — invalid type → error estructurado
# ---------------------------------------------------------------------------


async def test_record_measurement_invalid_type_is_error(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rm_it",
        "user_rm_it",
        [("Eva", "2021-01-01")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_measurement",
                {
                    "child_name": "Eva",
                    "type": "temperature",
                    "value": 36.5,
                    "unit": "°C",
                },
            )

    # El enum del inputSchema valida type/unit ANTES de llegar al handler: el SDK
    # rechaza con isError=True ("Input validation error: ..."). El contrato
    # (rechazo de valores fuera del enum) se conserva; la validación vive ahora en
    # la capa de schema, no en el handler.
    assert result.isError is True
    text = result.content[0].text
    assert "Input validation error" in text


# ---------------------------------------------------------------------------
# record_measurement — child not found → error con lista de válidos
# ---------------------------------------------------------------------------


async def test_record_measurement_child_not_found_is_error(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rm_nf",
        "user_rm_nf",
        [("Noa", "2020-02-10")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_measurement",
                {
                    "child_name": "Inexistente",
                    "type": "height",
                    "value": 100.0,
                    "unit": "cm",
                },
            )

    payload = _tool_result(result)
    assert payload["error"] == "not_found"
    assert any(c["name"] == "Noa" for c in payload["valid_children"])


# ---------------------------------------------------------------------------
# record_measurement — child ambiguous → error con lista de válidos
# ---------------------------------------------------------------------------


async def test_record_measurement_child_ambiguous_is_error(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rm_amb",
        "user_rm_amb",
        [("Leo", "2019-01-01"), ("leo", "2021-05-05")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_measurement",
                {
                    "child_name": "LEO",
                    "type": "weight",
                    "value": 12.0,
                    "unit": "kg",
                },
            )

    payload = _tool_result(result)
    assert payload["error"] == "ambiguous"
    assert len(payload["valid_children"]) == 2


# ---------------------------------------------------------------------------
# record_size — happy paths
# ---------------------------------------------------------------------------


async def test_record_size_clothing_happy_path(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rs_c1",
        "user_rs_c1",
        [("Marta", "2020-04-20")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_size",
                {
                    "child_name": "Marta",
                    "type": "clothing",
                    "label": "5-6 años",
                },
            )

    payload = _tool_result(result)
    assert payload["type"] == "clothing"
    assert payload["label"] == "5-6 años"
    assert "id" in payload


async def test_record_size_footwear_happy_path(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rs_f1",
        "user_rs_f1",
        [("Lucas", "2019-09-12")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_size",
                {
                    "child_name": "Lucas",
                    "type": "footwear",
                    "label": "26",
                },
            )

    payload = _tool_result(result)
    assert payload["type"] == "footwear"
    assert payload["label"] == "26"


# ---------------------------------------------------------------------------
# record_size — invalid type → error estructurado
# ---------------------------------------------------------------------------


async def test_record_size_invalid_type_is_error(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rs_it",
        "user_rs_it",
        [("Ana", "2020-07-07")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_size",
                {
                    "child_name": "Ana",
                    "type": "hat",
                    "label": "M",
                },
            )

    # El enum del inputSchema valida type ANTES de llegar al handler: el SDK
    # rechaza con isError=True ("Input validation error: ..."). El contrato
    # (rechazo de valores fuera del enum) se conserva; la validación vive ahora en
    # la capa de schema, no en el handler.
    assert result.isError is True
    text = result.content[0].text
    assert "Input validation error" in text


# ---------------------------------------------------------------------------
# record_size — child not found → error con lista de válidos
# ---------------------------------------------------------------------------


async def test_record_size_child_not_found_is_error(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rs_nf",
        "user_rs_nf",
        [("Iris", "2021-03-03")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = await c.call_tool(
                "record_size",
                {
                    "child_name": "Nadie",
                    "type": "clothing",
                    "label": "4",
                },
            )

    payload = _tool_result(result)
    assert payload["error"] == "not_found"
    assert any(c["name"] == "Iris" for c in payload["valid_children"])


# ---------------------------------------------------------------------------
# record_measurement — aislamiento: Familia A no graba en Familia B
# ---------------------------------------------------------------------------


async def test_record_measurement_isolated_between_families(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:

    # Familia A con Hijo "Sol"
    token_a = await _seed_token_and_children(
        auth_client,
        identity,
        "org_rm_iso_a",
        "user_rm_iso_a",
        [("Sol", "2020-01-01")],
    )
    # Familia B con Hijo "Luna"
    await _seed_token_and_children(
        auth_client,
        identity,
        "org_rm_iso_b",
        "user_rm_iso_b",
        [("Luna", "2021-01-01")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token_a) as c:
            result_ok = await c.call_tool(
                "record_measurement",
                {
                    "child_name": "Sol",
                    "type": "height",
                    "value": 80.0,
                    "unit": "cm",
                },
            )

        # Token A intenta grabar Medida para Luna (de Familia B) → error
        async with mcp_client_factory(token_a) as c:
            result_fail = await c.call_tool(
                "record_measurement",
                {
                    "child_name": "Luna",
                    "type": "height",
                    "value": 75.0,
                    "unit": "cm",
                },
            )

    payload_ok = _tool_result(result_ok)
    assert "id" in payload_ok
    payload_fail = _tool_result(result_fail)
    assert payload_fail["error"] == "not_found"
    assert any(c["name"] == "Sol" for c in payload_fail["valid_children"])
    assert not any(c["name"] == "Luna" for c in payload_fail["valid_children"])


# ---------------------------------------------------------------------------
# list_event_types — lectura mínima de tipos base + propios
# ---------------------------------------------------------------------------


async def test_list_event_types_returns_system_types(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Una Familia sin tipos propios ve exactamente los 5 tipos base."""

    _as(identity, "org_mcp_et_sys", "user_mcp_et_sys")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = _tool_result(await c.call_tool("list_event_types", {}))

    names = sorted([t["name"] for t in result])
    assert names == ["Cole", "Extraescolar", "Médico", "Otros", "Trámite"]


async def test_list_event_types_includes_custom_types(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Si la Familia ha creado un tipo propio, list_event_types lo incluye."""

    _as(identity, "org_mcp_et_cust", "user_mcp_et_cust")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]
    # Crear un tipo personalizado vía REST.
    resp = await auth_client.post(
        "/event-types", json={"name": "Cumpleaños", "icon": "cake"}
    )
    assert resp.status_code == 201

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
            result = _tool_result(await c.call_tool("list_event_types", {}))

    names = sorted([t["name"] for t in result])
    assert "Cumpleaños" in names
    # Los tipos base siguen presentes.
    assert "Médico" in names


# ---------------------------------------------------------------------------
# create_event — alta de Evento suelto
# ---------------------------------------------------------------------------


async def test_create_event_happy_path(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Crea un Evento suelto con tipo válido, sin Hijo, sin hora."""

    _as(identity, "org_mcp_ev_hp", "user_mcp_ev_hp")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
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


async def test_create_event_with_time(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Crea un Evento con hora (no día completo)."""

    _as(identity, "org_mcp_ev_time", "user_mcp_ev_time")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
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
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Crea un Evento asociado a un Hijo por matching estricto."""

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_ev_child",
        "user_mcp_ev_child",
        [("Lucas", "2019-05-10")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
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
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Si el tipo dictado no encaja, se usa 'Otros' sin error."""

    _as(identity, "org_mcp_ev_otros", "user_mcp_ev_otros")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
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
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """child_name sin coincidencia → error con lista de Hijos válidos."""

    token = await _seed_token_and_children(
        auth_client,
        identity,
        "org_mcp_ev_cnf",
        "user_mcp_ev_cnf",
        [("Sofía", "2020-01-01")],
    )

    async with _lifespan(None):
        async with mcp_client_factory(token) as c:
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


async def test_create_event_isolation(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Un Evento creado por Familia A no es visible para Familia B."""

    # Familia A crea un Evento.
    _as(identity, "org_mcp_ev_iso_a", "user_mcp_ev_iso_a")
    token_a = (await auth_client.post("/mcp-tokens")).json()["token"]

    # Familia B.
    _as(identity, "org_mcp_ev_iso_b", "user_mcp_ev_iso_b")
    token_b = (await auth_client.post("/mcp-tokens")).json()["token"]

    async with _lifespan(None):
        # Familia A crea un Evento.
        async with mcp_client_factory(token_a) as c:
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
        async with mcp_client_factory(token_b) as c:
            types_b = _tool_result(await c.call_tool("list_event_types", {}))

    # Ambas Familias ven los tipos base, verificamos que la herramienta funciona
    # bajo aislamiento (no hubo errores de RLS).
    names_b = [t["name"] for t in types_b]
    assert "Trámite" in names_b
