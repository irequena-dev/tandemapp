"""Invariant test: el parsing tolerante de fecha/hora vive en su propio módulo
profundo (app/mcp/dates.py), no enterrado dentro del dispatcher MCP.

Es una concern pura (tablas de meses en español, regex, relativos) sin ninguna
relación con el dispatch de herramientas — tenerla dentro de server.py rompía la
localidad y la navegabilidad. (issue: deepening — dates module)
"""

import inspect

from app.mcp import dates, server


def test_dates_module_owns_the_parsing_surface() -> None:
    """Las funciones canónicas viven en app.mcp.dates."""
    assert hasattr(dates, "parse_flexible_date")
    assert hasattr(dates, "parse_flexible_time")
    assert hasattr(dates, "DateParseError")


def test_server_no_longer_defines_parsing_internals() -> None:
    """server.py ya NO define el cuerpo del parser: lo importa del módulo profundo.
    Aplica el deletion test: borrar el módulo dates concentraría la complejidad
    de vuelta en el dispatcher."""
    src = inspect.getsource(server)
    # Las definiciones internas del parser ya no viven aquí.
    for forbidden in (
        "_SPANISH_MONTHS",
        "def parse_flexible_date",
        "def parse_flexible_time",
        "def _strip_accents",
        "class DateParseError",
    ):
        assert forbidden not in src, f"server.py aún define {forbidden!r}"
    # Y lo reexporta/usar vía import para no romper callers.
    assert "dates" in src
