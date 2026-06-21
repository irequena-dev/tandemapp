"""Invariant test: hay UN solo seam para cargar un Hijo propiedad de la Familia
activa (o 404). Antes esta lógica estaba duplicada en children/measurements/
sizes/health_visits. (issue: deepening — child access seam)
"""

import inspect

from app.api import children, health_visits, measurements, sizes
from app.api.children_access import get_owned_child

REST_MODULES = (children, measurements, sizes, health_visits)


def test_get_owned_child_is_defined_once_no_duplicates() -> None:
    """El cuerpo de `get_owned_child` vive en un único módulo; ningún handler REST
    lo redefine. Aplica el deletion test: borrar el shared module concentraría la
    complejidad, no la movería."""
    for mod in REST_MODULES:
        src = inspect.getsource(mod)
        assert "async def _get_owned_child" not in src, (
            f"{mod.__name__} sigue definiendo su propio _get_owned_child"
        )
        assert "def get_owned_child" not in src, (
            f"{mod.__name__} redefine get_owned_child en vez de importarlo"
        )


def test_all_rest_handlers_use_the_shared_seam() -> None:
    """Todos los handlers referencian el mismo objeto `get_owned_child`."""
    for mod in REST_MODULES:
        assert inspect.getsource(mod).count("get_owned_child") >= 1, (
            f"{mod.__name__} no usa el seam compartido"
        )
    # El seam es uno solo: reimportarlo da siempre el mismo objeto.
    from app.api.children_access import get_owned_child as again

    assert again is get_owned_child
