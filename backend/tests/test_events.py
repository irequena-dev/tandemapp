import uuid
from datetime import date, timedelta

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _create_child(client: AsyncClient, name: str = "Mateo") -> str:
    resp = await client.post(
        "/children", json={"name": name, "birth_date": "2020-01-01"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _get_event_type_id(client: AsyncClient) -> str:
    """Devuelve el id del primer tipo base (sistema) disponible."""
    resp = await client.get("/event-types")
    assert resp.status_code == 200
    system = [t for t in resp.json() if t["is_system"]]
    assert len(system) > 0
    return system[0]["id"]


# ---------- Crear ----------


async def test_create_event_with_time_and_child(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Crear un Evento con hora y Hijo asociado → 201 con datos expandidos."""
    _as(identity, "org_ev_create", "user_ev_create")

    child_id = await _create_child(auth_client)
    type_id = await _get_event_type_id(auth_client)

    resp = await auth_client.post(
        "/events",
        json={
            "title": "Control pediatra",
            "date": "2030-06-28",
            "time": "10:00:00",
            "event_type_id": type_id,
            "child_id": child_id,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Control pediatra"
    assert body["date"] == "2030-06-28"
    assert body["time"] == "10:00:00"
    assert body["child_id"] == child_id
    assert body["child"] is not None
    assert body["child"]["name"] == "Mateo"
    assert body["event_type"] is not None
    assert body["status"] == "pending"
    assert body["is_overdue"] is False
    assert body["series_id"] is None
    assert body["created_by"] == "user_ev_create"


async def test_create_event_without_time_or_child(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Crear un Evento sin hora (día completo) ni Hijo → 201."""
    _as(identity, "org_ev_notime", "user_ev_notime")
    type_id = await _get_event_type_id(auth_client)

    resp = await auth_client.post(
        "/events",
        json={
            "title": "Renovar DNI",
            "date": "2030-07-15",
            "event_type_id": type_id,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["time"] is None
    assert body["child_id"] is None
    assert body["child"] is None


# ---------- Listar + filtros ----------


async def test_list_events_with_filters(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Listar con filtros type_id y child_id."""
    _as(identity, "org_ev_filter", "user_ev_filter")

    child_id = await _create_child(auth_client, "Lucía")
    types = (await auth_client.get("/event-types")).json()
    medico = next(t for t in types if t["name"] == "Médico")
    cole = next(t for t in types if t["name"] == "Cole")

    # Crear 3 eventos: 2 médico (uno con hijo, uno sin), 1 cole
    await auth_client.post(
        "/events",
        json={
            "title": "Pediatra",
            "date": "2030-01-01",
            "event_type_id": medico["id"],
            "child_id": child_id,
        },
    )
    await auth_client.post(
        "/events",
        json={
            "title": "Vacuna familiar",
            "date": "2030-01-02",
            "event_type_id": medico["id"],
        },
    )
    await auth_client.post(
        "/events",
        json={
            "title": "Reunión padres",
            "date": "2030-01-03",
            "event_type_id": cole["id"],
        },
    )

    # Sin filtros → todos
    all_events = (await auth_client.get("/events")).json()
    assert len(all_events) >= 3

    # Filtro por tipo Médico
    med_events = (await auth_client.get(f"/events?type_id={medico['id']}")).json()
    assert all(e["event_type"]["name"] == "Médico" for e in med_events)
    assert len(med_events) >= 2

    # Filtro por child_id
    child_events = (await auth_client.get(f"/events?child_id={child_id}")).json()
    assert all(e["child_id"] == child_id for e in child_events)
    assert len(child_events) >= 1

    # Filtro combinado
    combined = (
        await auth_client.get(f"/events?type_id={medico['id']}&child_id={child_id}")
    ).json()
    assert len(combined) >= 1
    assert all(
        e["child_id"] == child_id and e["event_type"]["name"] == "Médico"
        for e in combined
    )


# ---------- Editar ----------


async def test_update_event(auth_client: AsyncClient, identity: dict) -> None:
    """PATCH parcial actualiza solo los campos enviados."""
    _as(identity, "org_ev_edit", "user_ev_edit")
    type_id = await _get_event_type_id(auth_client)

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "Original",
                "date": "2030-08-01",
                "event_type_id": type_id,
            },
        )
    ).json()

    resp = await auth_client.patch(
        f"/events/{created['id']}",
        json={"title": "Editado", "date": "2030-09-01"},
    )
    assert resp.status_code == 200, resp.json()
    assert resp.json()["title"] == "Editado"
    assert resp.json()["date"] == "2030-09-01"


# ---------- Borrar ----------


async def test_delete_event(auth_client: AsyncClient, identity: dict) -> None:
    """DELETE devuelve 204 y el Evento desaparece del listado."""
    _as(identity, "org_ev_del", "user_ev_del")
    type_id = await _get_event_type_id(auth_client)

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "Borrable",
                "date": "2030-12-25",
                "event_type_id": type_id,
            },
        )
    ).json()

    resp = await auth_client.delete(f"/events/{created['id']}")
    assert resp.status_code == 204

    listed = (await auth_client.get("/events")).json()
    assert not any(e["id"] == created["id"] for e in listed)


# ---------- Done / Undo ----------


async def test_done_and_undo(auth_client: AsyncClient, identity: dict) -> None:
    """POST done marca hecho; POST undo revierte a pendiente."""
    _as(identity, "org_ev_done", "user_ev_done")
    type_id = await _get_event_type_id(auth_client)

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "Marcar hecho",
                "date": "2030-06-20",
                "event_type_id": type_id,
            },
        )
    ).json()
    assert created["status"] == "pending"

    done = (await auth_client.post(f"/events/{created['id']}/done")).json()
    assert done["status"] == "done"
    assert done["is_overdue"] is False

    undo = (await auth_client.post(f"/events/{created['id']}/undo")).json()
    assert undo["status"] == "pending"


# ---------- is_overdue ----------


async def test_overdue_calculated_on_read(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Un Evento pasado y pendiente se reporta como atrasado; done no es atrasado."""
    _as(identity, "org_ev_overdue", "user_ev_overdue")
    type_id = await _get_event_type_id(auth_client)

    yesterday = (date.today() - timedelta(days=1)).isoformat()

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "Ayer",
                "date": yesterday,
                "event_type_id": type_id,
            },
        )
    ).json()
    assert created["is_overdue"] is True
    assert created["status"] == "pending"

    # Marcar hecho → ya no es overdue
    done = (await auth_client.post(f"/events/{created['id']}/done")).json()
    assert done["is_overdue"] is False
    assert done["status"] == "done"


# ---------- Aislamiento por Familia ----------


async def test_events_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Los Eventos de una Familia no son visibles para otra."""
    _as(identity, "org_ev_iso_a", "user_ev_iso_a")
    type_id = await _get_event_type_id(auth_client)

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "Solo mío",
                "date": "2030-03-01",
                "event_type_id": type_id,
            },
        )
    ).json()

    # Otra familia no ve el evento.
    _as(identity, "org_ev_iso_b", "user_ev_iso_b")
    listed = (await auth_client.get("/events")).json()
    assert not any(e["id"] == created["id"] for e in listed)

    # Otra familia no puede editar ni borrar (RLS → 404).
    assert (
        await auth_client.patch(f"/events/{created['id']}", json={"title": "Robo"})
    ).status_code == 404
    assert (await auth_client.delete(f"/events/{created['id']}")).status_code == 404


# ---------- 404 on missing ----------


async def test_get_nonexistent_event_returns_404(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_ev_404", "user_ev_404")
    fake_id = str(uuid.uuid4())
    assert (await auth_client.get(f"/events/{fake_id}")).status_code == 404


# ---------- Requires family ----------


async def test_create_event_requires_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Sin Familia activa → 403."""
    identity.clear()
    identity.update({"sub": "user_no_org_ev"})
    resp = await auth_client.post(
        "/events",
        json={
            "title": "Sin familia",
            "date": "2030-01-01",
            "event_type_id": str(uuid.uuid4()),
        },
    )
    assert resp.status_code == 403
