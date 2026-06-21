"""Invariantes del seam de tenancy unificado (ADR-0005, issue 02).

Una sola puerta (`open_family_scope`) abre sesión, abre transacción y fija
`app.current_family_id`. Los handlers REST ya no declaran `current_family_id`/
`current_member_id`: leen la identidad del `FamilyScope`. El MCP enruta su
sesión por el mismo seam.
"""

from __future__ import annotations

import dataclasses
import inspect
from pathlib import Path

from app import tenancy
from app.mcp import server

API_DIR = Path(__file__).resolve().parent.parent / "app" / "api"
APP_DIR = Path(__file__).resolve().parent.parent / "app"


def _api_source() -> str:
    """Concatena el fuente de todos los módulos bajo `app/api/`."""
    parts: list[str] = []
    for py in sorted(API_DIR.glob("*.py")):
        parts.append(py.read_text(encoding="utf-8"))
    return "\n".join(parts)


def test_no_api_handler_declares_identity_deps() -> None:
    """ADR-0005: ningún handler REST declara `current_family_id`/`current_member_id`."""
    source = _api_source()
    assert "Depends(current_family_id)" not in source
    assert "Depends(current_member_id)" not in source


def test_family_scope_carries_identity() -> None:
    """`family_session` entrega un `FamilyScope` dataclass con sesión + identidad."""
    assert dataclasses.is_dataclass(tenancy.FamilyScope)
    field_names = {f.name for f in dataclasses.fields(tenancy.FamilyScope)}
    assert {"session", "family_id", "member_id"} <= field_names

    sig = inspect.signature(tenancy.family_session)
    annotation = sig.return_annotation
    # La anotación de retorno debe mencionar FamilyScope
    # (puede ser AsyncIterator[FamilyScope]).
    assert "FamilyScope" in str(annotation)


def test_tool_session_uses_open_family_scope() -> None:
    """El MCP enruta su sesión por `open_family_scope` (no abre sesión propia)."""
    src = inspect.getsource(server.tool_session)
    assert "open_family_scope" in src
    assert "set_config" not in src
    assert "get_sessionmaker" not in src


def test_rls_setup_lives_in_one_place() -> None:
    """ADR-0005 "one door": `set_config` solo aparece dentro de `open_family_scope`."""
    occurrences: list[Path] = []
    for py in APP_DIR.rglob("*.py"):
        if "__pycache__" in py.parts:
            continue
        if "set_config" in py.read_text(encoding="utf-8"):
            occurrences.append(py)

    # Solo tenancy.py puede fijar la variable RLS.
    assert len(occurrences) == 1, occurrences
    assert occurrences[0].name == "tenancy.py"
    scope_src = inspect.getsource(tenancy.open_family_scope)
    assert "set_config" in scope_src
