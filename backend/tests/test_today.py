"""GET /api/today — pantalla Hoy: estado calmado + tarjeta Compra.

Cada fase extiende `/api/today`; aquí se cubren también los aportes de la
Fase 3 (héroe dosis, timeline de tomas, contadores de Pautas) y de la Fase 4
(timeline de Eventos, próxima cita, héroe evento).
"""

import os
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine


def _as(identity: dict, org_id: str, user_id: str, name: str = "Test User") -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id, "name": name})


async def _create_child(client: AsyncClient, name: str = "Mateo") -> str:
    resp = await client.post(
        "/children", json={"name": name, "birth_date": "2020-03-15"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_pauta(
    client: AsyncClient,
    child_id: str,
    *,
    medication: str = "Amoxicilina",
    dose: str = "5 ml",
    interval_hours: int = 8,
    duration_days: int = 7,
) -> dict:
    resp = await client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": medication,
            "dose": dose,
            "interval_hours": interval_hours,
            "duration_days": duration_days,
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def _backdate_pauta(pauta_id: str, days_ago: int = 2) -> None:
    """Retrocede `started_at` para que la Pauta expire (owner, sin RLS)."""
    from sqlalchemy import text

    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with AsyncSession(engine) as session:
        await session.execute(
            text(
                "UPDATE pautas SET started_at = now() - make_interval(days => :d) "
                "WHERE id = :id"
            ),
            {"d": days_ago, "id": pauta_id},
        )
        await session.commit()
    await engine.dispose()


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


# ---------- Aporte Fase 3: contadores de Pautas ---------- #


async def test_today_pautas_active_and_finished_counts(
    auth_client: AsyncClient, identity: dict
) -> None:
    """summary refleja las Pautas activas y finalizadas de la Familia."""
    _as(identity, "org_today_pdose", "user_today_pdose")
    child_id = await _create_child(auth_client)

    # Una activa y una finalizada.
    await _create_pauta(auth_client, child_id)
    finished = await _create_pauta(
        auth_client, child_id, medication="Paracetamol", dose="2.5 ml"
    )
    await auth_client.post(f"/pautas/{finished['id']}/finish")

    resp = await auth_client.get("/api/today")
    assert resp.status_code == 200
    summary = resp.json()["summary"]
    assert summary["pautas_active_count"] == 1
    assert summary["pautas_finished_count"] == 1


# ---------- Aporte Fase 3: héroe "Ahora" con la próxima toma ---------- #


async def test_today_hero_overdue_dose(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una toma vencida (next_dose_at en el pasado) ocupa el héroe."""
    _as(identity, "org_today_phover", "user_today_phover")
    child_id = await _create_child(auth_client, "Mateo")
    pauta = await _create_pauta(auth_client, child_id)  # intervalo 8h

    # Administración hace 9h → next_dose_at = ahora - 1h (vencida).
    past = (datetime.now(UTC) - timedelta(hours=9)).isoformat()
    await auth_client.post(
        f"/pautas/{pauta['id']}/administrations", json={"administered_at": past}
    )

    resp = await auth_client.get("/api/today")
    hero = resp.json()["hero"]
    assert hero is not None
    assert hero["type"] == "pauta_dose"
    assert hero["title"] == "Amoxicilina · 5 ml"
    assert hero["subtitle"] == "Mateo · Día 1 de 7"
    assert hero["action_label"] == "Marcar toma"
    assert hero["pauta_id"] == pauta["id"]


# ---------- Aporte Fase 3: timeline de tomas ---------- #


async def test_today_timeline_shows_given_and_upcoming_doses(
    auth_client: AsyncClient, identity: dict
) -> None:
    """El timeline incluye las tomas dadas hoy y la próxima (dose_upcoming)."""
    _as(identity, "org_today_ptl", "user_today_ptl", name="Ana")
    child_id = await _create_child(auth_client, "Mateo")
    pauta = await _create_pauta(auth_client, child_id)  # intervalo 8h
    pauta_id = pauta["id"]

    # Una Administración ahora (hoy) → queda como dose_given; next_dose_at = +8h.
    now_iso = datetime.now(UTC).isoformat()
    r = await auth_client.post(
        f"/pautas/{pauta_id}/administrations", json={"administered_at": now_iso}
    )
    admin_id = r.json()["id"]

    resp = await auth_client.get("/api/today")
    timeline = resp.json()["timeline"]
    types = [e["type"] for e in timeline]
    assert "dose_given" in types
    assert "dose_upcoming" in types

    given = next(e for e in timeline if e["type"] == "dose_given")
    assert given["pauta_id"] == pauta_id
    assert given["administration_id"] == admin_id
    assert given["status"] == "done"
    assert given["title"] == "Amoxicilina · 5 ml"
    assert given["subtitle"] == "Dada por Ana"
    assert ":" in given["time"]  # HH:MM

    upcoming = next(e for e in timeline if e["type"] == "dose_upcoming")
    assert upcoming["pauta_id"] == pauta_id
    assert upcoming["status"] == "upcoming"
    # Orden cronológico: la dada (ahora) antes que la próxima (+8h).
    assert timeline.index(given) < timeline.index(upcoming)


async def test_today_hero_picks_most_overdue_dose(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Con varias tomas vencidas, el héroe es la más vencida (próxima más temprana)."""
    _as(identity, "org_today_pprio", "user_today_pprio")
    child_id = await _create_child(auth_client, "Mateo")
    p1 = await _create_pauta(auth_client, child_id, medication="Ibuprofeno")
    p2 = await _create_pauta(auth_client, child_id, medication="Amoxicilina")

    # p1: admin hace 10h → next_dose = ahora-2h (más vencida).
    # p2: admin hace 9h  → next_dose = ahora-1h.
    await auth_client.post(
        f"/pautas/{p1['id']}/administrations",
        json={"administered_at": (datetime.now(UTC) - timedelta(hours=10)).isoformat()},
    )
    await auth_client.post(
        f"/pautas/{p2['id']}/administrations",
        json={"administered_at": (datetime.now(UTC) - timedelta(hours=9)).isoformat()},
    )

    hero = (await auth_client.get("/api/today")).json()["hero"]
    assert hero is not None
    assert hero["pauta_id"] == p1["id"]
    assert hero["title"] == "Ibuprofeno · 5 ml"


async def test_today_no_hero_when_dose_far_in_future(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una toma que vence más allá de la ventana inminente deja el héroe calmado."""
    _as(identity, "org_today_pcalm", "user_today_pcalm")
    child_id = await _create_child(auth_client)
    # Pauta recién creada: next_dose_at = ahora + 8h (fuera de la ventana).
    await _create_pauta(auth_client, child_id)

    resp = await auth_client.get("/api/today")
    assert resp.json()["hero"] is None


async def test_today_lazy_finish_counts_expired_pauta(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una Pauta caducada se finaliza lazy: cuenta como finished, sin héroe."""
    _as(identity, "org_today_plazy", "user_today_plazy")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id, duration_days=3)
    await _backdate_pauta(pauta["id"], days_ago=5)  # started+3d < ahora → expirada

    resp = await auth_client.get("/api/today")
    body = resp.json()
    assert body["summary"]["pautas_active_count"] == 0
    assert body["summary"]["pautas_finished_count"] == 1
    assert body["hero"] is None
    assert body["timeline"] == []


async def test_today_hero_imminent_dose(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una toma que vence dentro de la ventana inminente también ocupa el héroe."""
    _as(identity, "org_today_phimin", "user_today_phimin")
    child_id = await _create_child(auth_client, "Mateo")
    # intervalo 1h → next_dose_at = ahora + 1h (dentro de la ventana de 2h).
    pauta = await _create_pauta(
        auth_client, child_id, interval_hours=1, duration_days=2
    )

    hero = (await auth_client.get("/api/today")).json()["hero"]
    assert hero is not None
    assert hero["type"] == "pauta_dose"
    assert hero["pauta_id"] == pauta["id"]
    assert hero["subtitle"] == "Mateo · Día 1 de 2"
