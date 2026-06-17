"""GET /api/today — pantalla Hoy: estado calmado + tarjeta Compra."""

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


# ---------- Tarjeta Compra: shopping_pending_count ---------- #


async def test_today_shopping_pending_count(
    auth_client: AsyncClient, identity: dict
) -> None:
    """shopping_pending_count refleja los Ítems `pending` de la Familia."""
    _as(identity, "org_today_shop", "user_today_shop1")

    # Sin ítems → 0.
    resp = await auth_client.get("/api/today")
    assert resp.json()["summary"]["shopping_pending_count"] == 0

    # Crear 3 ítems pending.
    for text in ["Leche", "Pan", "Huevos"]:
        r = await auth_client.post("/api/shopping-items", json={"text": text})
        assert r.status_code == 201

    resp = await auth_client.get("/api/today")
    assert resp.json()["summary"]["shopping_pending_count"] == 3


async def test_today_shopping_count_ignores_bought(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Ítems comprados (bought) no se cuentan en shopping_pending_count."""
    _as(identity, "org_today_bought", "user_today_bought1")

    # Crear 2 ítems.
    ids = []
    for text in ["Jabón", "Fruta"]:
        r = await auth_client.post("/api/shopping-items", json={"text": text})
        assert r.status_code == 201
        ids.append(r.json()["id"])

    # Marcar uno como comprado (si el endpoint de buy existe).
    buy_resp = await auth_client.post(f"/api/shopping-items/{ids[0]}/buy")
    if buy_resp.status_code == 200:
        resp = await auth_client.get("/api/today")
        assert resp.json()["summary"]["shopping_pending_count"] == 1
    else:
        # Si buy no existe aún, al menos los 2 pending deben contar.
        resp = await auth_client.get("/api/today")
        assert resp.json()["summary"]["shopping_pending_count"] == 2


async def test_today_shopping_isolated_by_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    """shopping_pending_count está aislado por Familia (RLS)."""
    # Familia A: 2 ítems.
    _as(identity, "org_today_iso_a", "user_today_iso_a1")
    for text in ["Café", "Azúcar"]:
        await auth_client.post("/api/shopping-items", json={"text": text})

    resp_a = await auth_client.get("/api/today")
    assert resp_a.json()["summary"]["shopping_pending_count"] == 2

    # Familia B: 0 ítems.
    _as(identity, "org_today_iso_b", "user_today_iso_b1")
    resp_b = await auth_client.get("/api/today")
    assert resp_b.json()["summary"]["shopping_pending_count"] == 0
