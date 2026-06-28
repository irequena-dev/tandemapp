"""Invariantes del refactor del seam MCP (issue 01).

Estos tests NO necesitan Docker/Postgres: inspeccionan fuente y tipos.
Aseguran que:
- ningún handler `do_*` abre sesión / fija RLS / lee identidad directamente;
- el dispatcher es un registro, no un if/elif por nombre de tool;
- el registro coincide exactamente con las 11 herramientas listadas;
- `ToolError` serializa la forma unificada `{error, message, ...}`.
"""

import inspect
import json

from app.mcp import server
from app.mcp.child_matching import ChildMatchError
from app.mcp.server import TOOL_HANDLERS, ToolError

EXPECTED_TOOL_NAMES = {
    "list_children",
    "add_shopping_items",
    "record_health_visit",
    "start_pauta",
    "record_administration",
    "finish_pauta",
    "list_active_pautas",
    "record_measurement",
    "record_size",
    "list_event_types",
    "create_event",
}

FORBIDDEN_IN_HANDLER = (
    "get_sessionmaker",
    "set_config",
    "MCP_IDENTITY_KEY",
    "get_http_request",
)


def test_no_handler_opens_session_or_sets_config() -> None:
    """Cada valor del registro es domain-only: sin seam boilerplate."""
    assert TOOL_HANDLERS, "TOOL_HANDLERS está vacío"
    for name, fn in TOOL_HANDLERS.items():
        src = inspect.getsource(fn)
        for forbidden in FORBIDDEN_IN_HANDLER:
            assert forbidden not in src, (
                f"handler {name} referencia '{forbidden}' (debe vivir en tool_session)"
            )


def test_registry_matches_listed_tools() -> None:
    """El registro expone exactamente las 11 herramientas esperadas."""
    assert set(TOOL_HANDLERS.keys()) == EXPECTED_TOOL_NAMES


def test_dispatcher_uses_registry_without_name_branches() -> None:
    """El dispatcher resuelve por registro; sin if/elif por nombre de tool."""
    # El decorador del SDK envuelve handle_call_tool; leemos el fuente del
    # módulo y localizamos el cuerpo de la función.
    module_src = inspect.getsource(server)
    # Localizar la función handle_call_tool.
    marker = "async def handle_call_tool("
    assert marker in module_src, "no se encontró handle_call_tool en el módulo"
    start = module_src.index(marker)
    # Hasta la siguiente def/decorador relevante o fin del archivo.
    rest = module_src[start:]
    # Tomar hasta la siguiente definición top-level.
    lines = rest.splitlines()
    body: list[str] = []
    for _i, line in enumerate(lines[1:], start=1):
        stripped = line.lstrip()
        if (
            stripped.startswith("async def ")
            or stripped.startswith("def ")
            and not line.startswith(" ")
        ):
            break
        body.append(line)
    body_src = "\n".join(body)
    assert "TOOL_HANDLERS.get" in body_src, (
        "el dispatcher debe usar TOOL_HANDLERS.get para resolver el handler"
    )
    for name in EXPECTED_TOOL_NAMES:
        assert f'"{name}"' not in body_src and f"'{name}'" not in body_src, (
            f"el dispatcher no debe mencionar el nombre literal '{name}' "
            "(debe ser agnóstico al nombre)"
        )


def test_tool_error_serializes_unified_shape() -> None:
    """str(ToolError) es JSON con error + message."""
    payload = json.loads(str(ToolError({"error": "x", "message": "y"})))
    assert payload["error"] == "x"
    assert payload["message"] == "y"


def test_tool_error_child_match_error_shape() -> None:
    """ToolError.child_match_error produce {error, message, valid_children}."""

    class _FakeChild:
        def __init__(self, id: str, name: str, birth_date: str) -> None:
            self.id = id
            self.name = name
            self.birth_date = birth_date

    err = ChildMatchError(
        reason="not_found",
        valid_children=[_FakeChild("1", "Sofía", "2020-01-01")],
    )
    payload = json.loads(str(ToolError.child_match_error(err)))
    assert payload["error"] == "not_found"
    assert "message" in payload
    assert any(c["name"] == "Sofía" for c in payload["valid_children"])


def test_tool_error_is_not_value_error() -> None:
    """ToolError no es ValueError: el SDK usa str(exc) crudo como mensaje."""
    assert not issubclass(ToolError, ValueError)
