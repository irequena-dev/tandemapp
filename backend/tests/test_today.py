"""GET /api/today — pantalla Hoy en estado calmado (sin datos de dominio)."""

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_today_calm_state(auth_client: AsyncClient, identity: dict) -> None:
    """Sin datos de dominio, el endpoint devuelve la forma vacía / calmada."""
    _as(identity, "org_today", "user_today_1")

    resp = await auth_client.get("/api/today")
    assert resp.status_code == 200

    data = resp.json()
    assert data["hero"] is None
    assert data["timeline"] == []

    summary = data["summary"]
    assert summary["shopping_pending_count"] == 0
    assert summary["pautas_active_count"] == 0
    assert summary["pautas_finished_count"] == 0
    assert summary["next_medical_event"] is None
    assert summary["children_status"] == "up_to_date"


async def test_today_requires_auth(client: AsyncClient) -> None:
    """Sin JWT, el endpoint responde 401."""
    resp = await client.get("/api/today")
    assert resp.status_code == 401


async def test_today_requires_family(auth_client: AsyncClient, identity: dict) -> None:
    """Autenticado sin Organización activa → 403."""
    identity.clear()
    identity.update({"sub": "user_no_org_today"})
    resp = await auth_client.get("/api/today")
    assert resp.status_code == 403


async def test_today_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Cada Familia ve su propio /api/today independiente (contadores a cero)."""
    _as(identity, "org_today_a", "user_today_a1")
    resp_a = await auth_client.get("/api/today")
    assert resp_a.status_code == 200
    assert resp_a.json()["summary"]["shopping_pending_count"] == 0

    _as(identity, "org_today_b", "user_today_b1")
    resp_b = await auth_client.get("/api/today")
    assert resp_b.status_code == 200
    assert resp_b.json()["summary"]["shopping_pending_count"] == 0
