"""Invariant test: la regla de dominio «el valor actual es el más reciente por
tipo» (CONTEXT.md: Medida/Talla) vive en UN módulo profundo, no duplicada como
query `.order_by(...desc()).limit(1)` en cada handler.

Antes esta query aparecía 6 veces entre children, measurements y sizes. Ahora
hay un solo `app.current_values` con `latest_measurement` / `latest_size`.
(issue: deepening — current values module)
"""

import inspect

from app import current_values
from app.api import children, measurements, sizes

# Los handlers que antes inlineaban la query «última Medida/Talla por tipo».
DELEGATING_MODULES = (children, measurements, sizes)


def test_current_values_module_owns_the_latest_query() -> None:
    src = inspect.getsource(current_values)
    assert hasattr(current_values, "latest_measurement")
    assert hasattr(current_values, "latest_size")
    # El cuerpo canónico (latest por tipo, limit 1) vive aquí.
    assert "limit(1)" in src


def test_no_api_module_inlines_the_latest_by_type_query() -> None:
    """Ningún handler REST vuelve a escribir el cuerpo de la query «última Medida/
    Talla por tipo» (la forma `.order_by(...desc()).limit(1)`). Aplica el deletion
    test: borrar el módulo current_values concentraría la regla de dominio de
    vuelta, dispersa. El listado histórico sí ordena por fecha desc, pero sin
    `limit(1)` —es otra regla (historial cronológico), no el valor actual."""
    for mod in DELEGATING_MODULES:
        src = inspect.getsource(mod)
        assert "limit(1)" not in src, (
            f"{mod.__name__} vuelve a inlinear una query latest (limit 1)"
        )
        assert "latest_measurement" in src or "latest_size" in src, (
            f"{mod.__name__} no delega al seam current_values"
        )
