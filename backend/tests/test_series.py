"""Series recurrentes acotadas (Fase 4) — materialización y borrado de futuras.

Una Serie es solo generador: al crearse materializa todas sus ocurrencias como
Eventos independientes (cada uno con su `series_id`). Cubre la costura HTTP/REST.
"""

import uuid
from datetime import UTC, date, datetime, timedelta

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _get_event_type_id(client: AsyncClient) -> str:
    """Devuelve el id del primer tipo base (sistema) disponible."""
    resp = await client.get("/event-types")
    assert resp.status_code == 200
    system = [t for t in resp.json() if t["is_system"]]
    assert len(system) > 0
    return system[0]["id"]


# ---------- Materialización acotada por max_count ---------- #


async def test_create_weekly_series_materializes_occurrences(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /api/series weekly con max_count materializa N Eventos independientes."""
    _as(identity, "org_ser1", "user_ser1")
    type_id = await _get_event_type_id(auth_client)

    starts_at = date(2030, 1, 7)  # lunes
    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "Extraescolar",
            "event_type_id": type_id,
            "cadence": "weekly",
            "day_of_week": 0,  # lunes
            "starts_at": starts_at.isoformat(),
            "max_count": 4,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["events_created"] == 4
    assert uuid.UUID(body["id"])  # id válido

    # Los 4 Eventos materializados tienen las fechas esperadas (cada 7 días).
    events = (await auth_client.get("/events")).json()
    series_events = sorted(
        [e for e in events if e.get("series_id") == body["id"]],
        key=lambda e: e["date"],
    )
    assert len(series_events) == 4
    expected = [starts_at + timedelta(weeks=i) for i in range(4)]
    assert [date.fromisoformat(e["date"]) for e in series_events] == expected
    for e in series_events:
        assert e["title"] == "Extraescolar"
        assert e["event_type_id"] == type_id
        assert e["status"] == "pending"


# ---------- Borrado de futuras (preserva pasadas/marcadas) ---------- #


async def _create_weekly_series(
    client: AsyncClient,
    *,
    type_id: str,
    starts_at: date,
    count: int,
) -> str:
    resp = await client.post(
        "/api/series",
        json={
            "title": "Extraescolar",
            "event_type_id": type_id,
            "cadence": "weekly",
            "day_of_week": starts_at.weekday(),
            "starts_at": starts_at.isoformat(),
            "max_count": count,
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_delete_future_preserves_past_and_marked(
    auth_client: AsyncClient, identity: dict
) -> None:
    """DELETE /series/{id}/future borra futuras pending, conserva pasadas y marcadas."""
    _as(identity, "org_ser2", "user_ser2")
    type_id = await _get_event_type_id(auth_client)

    today = datetime.now(UTC).date()
    # Serie con ocurrencias pasadas (hace 3 y 2 semanas), hoy, y futuras (+1,+2,+3).
    starts_at = today - timedelta(weeks=3)
    series_id = await _create_weekly_series(
        auth_client, type_id=type_id, starts_at=starts_at, count=7
    )

    # Identificar las ocurrencias por fecha.
    events = sorted(
        [
            e
            for e in (await auth_client.get("/events")).json()
            if e["series_id"] == series_id
        ],
        key=lambda e: e["date"],
    )
    by_date = {date.fromisoformat(e["date"]): e for e in events}
    future_done = by_date[today + timedelta(weeks=2)]

    # Marcar una futura como hecha → debe conservarse aunque sea futura.
    marked = await auth_client.post(f"/events/{future_done['id']}/done")
    assert marked.status_code == 200

    resp = await auth_client.delete(f"/api/series/{series_id}/future")
    assert resp.status_code == 204

    remaining = sorted(
        [
            e
            for e in (await auth_client.get("/events")).json()
            if e["series_id"] == series_id
        ],
        key=lambda e: e["date"],
    )
    remaining_dates = {date.fromisoformat(e["date"]) for e in remaining}

    # Pasadas (hace 3 y 2 semanas) e hoy se conservan; la marcada (hecha) se conserva.
    assert today - timedelta(weeks=3) in remaining_dates
    assert today - timedelta(weeks=2) in remaining_dates
    assert today in remaining_dates  # hoy no es "futura"
    assert today + timedelta(weeks=2) in remaining_dates  # marcada → conservada
    # La futura pendiente (no marcada) se borra; y la de +3 semanas también.
    assert today + timedelta(weeks=1) not in remaining_dates
    assert today + timedelta(weeks=3) not in remaining_dates


# ---------- Cadencias y acotación ---------- #


async def _series_dates(client: AsyncClient, series_id: str) -> list[date]:
    events = sorted(
        [
            e
            for e in (await client.get("/events")).json()
            if e["series_id"] == series_id
        ],
        key=lambda e: e["date"],
    )
    return [date.fromisoformat(e["date"]) for e in events]


async def test_monthly_series_with_ends_at(
    auth_client: AsyncClient, identity: dict
) -> None:
    """monthly materializa el día de mes de starts_at, con clamp a fin de mes."""
    _as(identity, "org_ser3", "user_ser3")
    type_id = await _get_event_type_id(auth_client)

    # Día 31: enero(31), febrero(clamp 28), marzo(31), abril(clamp 30)…
    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "Pago",
            "event_type_id": type_id,
            "cadence": "monthly",
            "starts_at": "2030-01-31",
            "ends_at": "2030-04-30",
        },
    )
    assert resp.status_code == 201
    assert resp.json()["events_created"] == 4
    dates = await _series_dates(auth_client, resp.json()["id"])
    assert dates == [
        date(2030, 1, 31),
        date(2030, 2, 28),
        date(2030, 3, 31),
        date(2030, 4, 30),
    ]


async def test_biweekly_series_step(auth_client: AsyncClient, identity: dict) -> None:
    """biweekly materializa ocurrencias cada 14 días."""
    _as(identity, "org_ser4", "user_ser4")
    type_id = await _get_event_type_id(auth_client)

    starts_at = date(2030, 1, 9)  # miércoles
    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "Quincena",
            "event_type_id": type_id,
            "cadence": "biweekly",
            "day_of_week": 2,  # miércoles
            "starts_at": starts_at.isoformat(),
            "max_count": 3,
        },
    )
    assert resp.status_code == 201
    dates = await _series_dates(auth_client, resp.json()["id"])
    assert dates == [
        starts_at,
        starts_at + timedelta(days=14),
        starts_at + timedelta(days=28),
    ]


async def test_weekly_series_bounded_by_ends_at(
    auth_client: AsyncClient, identity: dict
) -> None:
    """ends_at acota el número de ocurrencias (fecha incluida)."""
    _as(identity, "org_ser5", "user_ser5")
    type_id = await _get_event_type_id(auth_client)

    starts_at = date(2030, 1, 7)  # lunes
    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "Tutoría",
            "event_type_id": type_id,
            "cadence": "weekly",
            "day_of_week": 0,
            "starts_at": starts_at.isoformat(),
            "ends_at": "2030-01-21",  # incluye 3 lunes: 7, 14, 21
        },
    )
    assert resp.status_code == 201
    assert resp.json()["events_created"] == 3
    dates = await _series_dates(auth_client, resp.json()["id"])
    assert dates == [date(2030, 1, 7), date(2030, 1, 14), date(2030, 1, 21)]


async def test_weekly_first_occurrence_advances_to_anchor_weekday(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Si starts_at no cae en day_of_week, la 1ª ocurrencia avanza al día ancla."""
    _as(identity, "org_ser6", "user_ser6")
    type_id = await _get_event_type_id(auth_client)

    # starts_at lunes 2030-01-07, ancla viernes (4): 1ª ocurrencia = 2030-01-11.
    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "Viernes",
            "event_type_id": type_id,
            "cadence": "weekly",
            "day_of_week": 4,  # viernes
            "starts_at": "2030-01-07",
            "max_count": 2,
        },
    )
    assert resp.status_code == 201
    dates = await _series_dates(auth_client, resp.json()["id"])
    assert dates == [date(2030, 1, 11), date(2030, 1, 18)]


# ---------- Independencia de ocurrencias ---------- #


async def test_occurrences_are_independent(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Marcar/borrar una ocurrencia no afecta a las demás de la misma Serie."""
    _as(identity, "org_ser7", "user_ser7")
    type_id = await _get_event_type_id(auth_client)

    starts_at = date(2030, 2, 5)  # martes
    series_id = await _create_weekly_series(
        auth_client, type_id=type_id, starts_at=starts_at, count=3
    )
    events = await _series_dates(auth_client, series_id)
    assert len(events) == 3

    # Cargar los Eventos para obtener ids.
    all_events = [
        e
        for e in (await auth_client.get("/events")).json()
        if e["series_id"] == series_id
    ]
    all_events.sort(key=lambda e: e["date"])

    # Marcar el primero como hecho y borrar el segundo → el tercero queda intacto.
    await auth_client.post(f"/events/{all_events[0]['id']}/done")
    await auth_client.delete(f"/events/{all_events[1]['id']}")

    remaining = [
        e
        for e in (await auth_client.get("/events")).json()
        if e["series_id"] == series_id
    ]
    remaining.sort(key=lambda e: e["date"])
    assert len(remaining) == 2
    assert remaining[0]["status"] == "done"  # el marcado
    assert remaining[1]["status"] == "pending"  # el tercero, intacto


# ---------- Validación de SeriesCreate ---------- #


async def test_weekly_requires_day_of_week(
    auth_client: AsyncClient, identity: dict
) -> None:
    """weekly sin day_of_week → 422."""
    _as(identity, "org_ser8", "user_ser8")
    type_id = await _get_event_type_id(auth_client)

    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "X",
            "event_type_id": type_id,
            "cadence": "weekly",
            "starts_at": "2030-01-07",
            "max_count": 2,
        },
    )
    assert resp.status_code == 422


async def test_series_requires_ends_at_or_max_count(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Serie sin ends_at ni max_count → 422 (debe estar acotada)."""
    _as(identity, "org_ser9", "user_ser9")
    type_id = await _get_event_type_id(auth_client)

    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "X",
            "event_type_id": type_id,
            "cadence": "monthly",
            "starts_at": "2030-01-15",
        },
    )
    assert resp.status_code == 422


async def test_day_of_week_out_of_range_rejected(
    auth_client: AsyncClient, identity: dict
) -> None:
    """day_of_week fuera de 0–6 → 422."""
    _as(identity, "org_ser10", "user_ser10")
    type_id = await _get_event_type_id(auth_client)

    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "X",
            "event_type_id": type_id,
            "cadence": "weekly",
            "day_of_week": 9,
            "starts_at": "2030-01-07",
            "max_count": 2,
        },
    )
    assert resp.status_code == 422


# ---------- Aislamiento por Familia (RLS) y errores ---------- #


async def test_series_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una Familia no ve las Series/Eventos de otra Familia (RLS)."""
    _as(identity, "org_ser_a", "user_ser_a")
    type_id_a = await _get_event_type_id(auth_client)
    resp_a = await auth_client.post(
        "/api/series",
        json={
            "title": "Serie A",
            "event_type_id": type_id_a,
            "cadence": "weekly",
            "day_of_week": 0,
            "starts_at": "2030-01-07",
            "max_count": 3,
        },
    )
    assert resp_a.status_code == 201
    series_a_id = resp_a.json()["id"]

    # Familia B: no debe ver los Eventos de la Serie de A.
    _as(identity, "org_ser_b", "user_ser_b")
    await _get_event_type_id(auth_client)  # calienta el contexto de B
    events_b = (await auth_client.get("/events")).json()
    assert not any(e["series_id"] == series_a_id for e in events_b)

    # B no puede borrar futuras de la Serie de A → 404 (RLS filtra el GET).
    resp = await auth_client.delete(f"/api/series/{series_a_id}/future")
    assert resp.status_code == 404


async def test_delete_future_unknown_series_404(
    auth_client: AsyncClient, identity: dict
) -> None:
    """DELETE de una Serie inexistente → 404."""
    _as(identity, "org_ser11", "user_ser11")
    unknown = uuid.uuid4()
    resp = await auth_client.delete(f"/api/series/{unknown}/future")
    assert resp.status_code == 404


async def test_create_series_requires_auth(client: AsyncClient) -> None:
    """Sin JWT, POST /api/series → 401."""
    resp = await client.post(
        "/api/series",
        json={
            "title": "X",
            "event_type_id": str(uuid.uuid4()),
            "cadence": "monthly",
            "starts_at": "2030-01-15",
            "max_count": 1,
        },
    )
    assert resp.status_code == 401


async def test_create_series_requires_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Autenticado sin Familia activa → 403."""
    identity.clear()
    identity.update({"sub": "user_no_org_ser"})
    resp = await auth_client.post(
        "/api/series",
        json={
            "title": "X",
            "event_type_id": str(uuid.uuid4()),
            "cadence": "monthly",
            "starts_at": "2030-01-15",
            "max_count": 1,
        },
    )
    assert resp.status_code == 403
