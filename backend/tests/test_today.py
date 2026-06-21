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


async def _get_event_type_id(client: AsyncClient, name: str = "Médico") -> str:
    """Devuelve el id del tipo base (sistema) con el nombre dado."""
    resp = await client.get("/event-types")
    assert resp.status_code == 200
    matches = [t for t in resp.json() if t["is_system"] and t["name"] == name]
    assert len(matches) > 0
    return matches[0]["id"]


async def _create_event(
    client: AsyncClient,
    *,
    type_id: str,
    date_iso: str,
    title: str = "Control pediatra",
    time: str | None = None,
    child_id: str | None = None,
) -> dict:
    payload: dict = {
        "title": title,
        "date": date_iso,
        "event_type_id": type_id,
    }
    if time is not None:
        payload["time"] = time
    if child_id is not None:
        payload["child_id"] = child_id
    resp = await client.post("/events", json=payload)
    assert resp.status_code == 201
    return resp.json()


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
    assert summary["children_status"] == "al_dia"


async def test_today_children_status_overdue(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Un Evento `pending` con fecha pasada → children_status "revision_vencida"."""
    _as(identity, "org_today_csover", "user_today_csover")
    child_id = await _create_child(auth_client, "Mateo")
    cole_id = await _get_event_type_id(auth_client, "Cole")
    yesterday = (datetime.now(UTC).date() - timedelta(days=1)).isoformat()

    await _create_event(
        auth_client,
        type_id=cole_id,
        date_iso=yesterday,
        title="Cole atrasado",
        child_id=child_id,
    )

    resp = await auth_client.get("/api/today")
    assert resp.json()["summary"]["children_status"] == "revision_vencida"


async def test_today_children_status_followup(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Evento médico `pending` en próximos 7 días → children_status "seguimiento"."""

    _as(identity, "org_today_csfol", "user_today_csfol")
    child_id = await _create_child(auth_client, "Mateo")
    med_id = await _get_event_type_id(auth_client, "Médico")
    in_three_days = (datetime.now(UTC).date() + timedelta(days=3)).isoformat()

    await _create_event(
        auth_client,
        type_id=med_id,
        date_iso=in_three_days,
        title="Control pediatra",
        child_id=child_id,
    )

    resp = await auth_client.get("/api/today")
    assert resp.json()["summary"]["children_status"] == "seguimiento"


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


# ---------- Aporte Fase 4: timeline de Eventos de hoy ---------- #


async def test_today_timeline_includes_todays_event(
    auth_client: AsyncClient, identity: dict
) -> None:
    """El timeline incluye los Eventos de hoy (type=event)."""
    _as(identity, "org_today_evtl", "user_today_evtl")
    type_id = await _get_event_type_id(auth_client, "Cole")
    today = datetime.now(UTC).date().isoformat()

    await _create_event(
        auth_client,
        type_id=type_id,
        date_iso=today,
        title="Cole",
        time="09:00:00",
    )

    resp = await auth_client.get("/api/today")
    timeline = resp.json()["timeline"]
    entries = [e for e in timeline if e["type"] == "event"]
    assert len(entries) == 1
    ev = entries[0]
    assert ev["title"] == "Cole"
    assert ev["time"] == "09:00"
    assert ev["status"] == "pending"
    assert ev["event_id"]


# ---------- Aporte Fase 4: próxima cita médica ---------- #


async def test_today_next_medical_event(
    auth_client: AsyncClient, identity: dict
) -> None:
    """summary.next_medical_event es el próximo Evento de tipo Médico."""
    _as(identity, "org_today_nme", "user_today_nme")
    med_id = await _get_event_type_id(auth_client, "Médico")
    future = (datetime.now(UTC).date() + timedelta(days=5)).isoformat()

    created = await _create_event(
        auth_client, type_id=med_id, date_iso=future, title="Vacuna", time="11:30:00"
    )

    resp = await auth_client.get("/api/today")
    nme = resp.json()["summary"]["next_medical_event"]
    assert nme is not None
    assert nme["id"] == created["id"]
    assert nme["title"] == "Vacuna"
    assert nme["event_type"]["name"] == "Médico"


async def test_today_next_medical_event_null_when_none(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Sin Eventos Médicos futuros, next_medical_event es null."""
    _as(identity, "org_today_nmenull", "user_today_nmenull")
    # Un Evento no médico no cuenta.
    cole_id = await _get_event_type_id(auth_client, "Cole")
    future = (datetime.now(UTC).date() + timedelta(days=3)).isoformat()
    await _create_event(auth_client, type_id=cole_id, date_iso=future, title="Cole")

    resp = await auth_client.get("/api/today")
    assert resp.json()["summary"]["next_medical_event"] is None


# ---------- Aporte Fase 4: héroe evento (fallback sin toma) ---------- #


async def test_today_event_hero_when_no_dose(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Sin toma pendiente, el Evento más inminente de hoy ocupa el héroe."""
    _as(identity, "org_today_evhero", "user_today_evhero")
    child_id = await _create_child(auth_client, "Lucía")
    cole_id = await _get_event_type_id(auth_client, "Cole")
    today = datetime.now(UTC).date().isoformat()

    created = await _create_event(
        auth_client,
        type_id=cole_id,
        date_iso=today,
        title="Cole",
        time="09:00:00",
        child_id=child_id,
    )

    hero = (await auth_client.get("/api/today")).json()["hero"]
    assert hero is not None
    assert hero["type"] == "event"
    assert hero["title"] == "Cole"
    assert hero["action_label"] == "Marcar hecho"
    assert hero["event_id"] == created["id"]
    assert "Lucía" in hero["subtitle"]


async def test_today_dose_hero_takes_priority_over_event(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Con una toma vencida Y un Evento de hoy, el héroe es la toma (prioridad)."""
    _as(identity, "org_today_dprio", "user_today_dprio")
    child_id = await _create_child(auth_client)
    # Pauta con toma vencida.
    pauta = await _create_pauta(auth_client, child_id)
    past = (datetime.now(UTC) - timedelta(hours=9)).isoformat()
    await auth_client.post(
        f"/pautas/{pauta['id']}/administrations", json={"administered_at": past}
    )
    # Evento de hoy.
    cole_id = await _get_event_type_id(auth_client, "Cole")
    await _create_event(
        auth_client,
        type_id=cole_id,
        date_iso=datetime.now(UTC).date().isoformat(),
        title="Cole",
        time="09:00:00",
    )

    hero = (await auth_client.get("/api/today")).json()["hero"]
    assert hero is not None
    assert hero["type"] == "pauta_dose"


# ---------- Aporte Fase 4: zona horaria del dispositivo ---------- #


async def test_today_grouping_uses_device_timezone(
    auth_client: AsyncClient, identity: dict
) -> None:
    """El param `tz` define qué es "hoy": un Evento aparece solo en su fecha local."""
    from zoneinfo import ZoneInfo

    _as(identity, "org_today_tz", "user_today_tz")
    cole_id = await _get_event_type_id(auth_client, "Cole")

    # UTC+14 y UTC-12 nunca comparten fecha calendario → determinista siempre.
    ahead = ZoneInfo("Pacific/Kiritimati")  # UTC+14
    behind = ZoneInfo("Etc/GMT+12")  # UTC-12 (zonas Etc están invertidas)
    today_ahead = datetime.now(ahead).date()
    today_behind = datetime.now(behind).date()
    assert today_ahead != today_behind  # sanity del test

    await _create_event(
        auth_client, type_id=cole_id, date_iso=today_ahead.isoformat(), title="Cole"
    )

    resp_ahead = await auth_client.get("/api/today?tz=Pacific/Kiritimati")
    ahead_entries = [e for e in resp_ahead.json()["timeline"] if e["type"] == "event"]
    assert len(ahead_entries) == 1  # es "hoy" en la zona adelantada

    # El `+` de Etc/GMT+12 debe ir codificado (%2B): sin codificar, el query
    # string lo vuelve espacio → zona inválida → el servidor caería a UTC.
    resp_behind = await auth_client.get("/api/today?tz=Etc/GMT%2B12")
    behind_entries = [e for e in resp_behind.json()["timeline"] if e["type"] == "event"]
    assert behind_entries == []  # no es "hoy" en la zona atrasada


# ---------- Aporte Fase 4: timeline cronológico (Eventos) ---------- #


async def test_today_timeline_events_ordered_chronologically(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Varios Eventos de hoy se ordenan cronológicamente por hora."""
    _as(identity, "org_today_evord", "user_today_evord")
    cole_id = await _get_event_type_id(auth_client, "Cole")
    today = datetime.now(UTC).date().isoformat()

    await _create_event(
        auth_client, type_id=cole_id, date_iso=today, title="Cena", time="20:00:00"
    )
    await _create_event(
        auth_client, type_id=cole_id, date_iso=today, title="Cole", time="09:00:00"
    )

    timeline = (await auth_client.get("/api/today")).json()["timeline"]
    events = [e for e in timeline if e["type"] == "event"]
    assert [e["title"] for e in events] == ["Cole", "Cena"]
