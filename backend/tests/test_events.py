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


async def _materialize_member(
    client: AsyncClient,
    identity: dict,
    org_id: str,
    user_id: str,
    name: str,
) -> str:
    """Crea (upsert) un Miembro con display_name via cualquier llamada autenticada."""
    _as(identity, org_id, user_id)
    identity["name"] = name
    await client.get("/members")
    return user_id


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


# ---------- Editar sujeto Miembro ----------


async def test_update_event_set_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """PATCH con member_id de la Familia → 200, member_id set y member expandido."""
    _as(identity, "org_ev_set_mem", "user_ev_set_mem")
    type_id = await _get_event_type_id(auth_client)

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_set_mem", "user_ana_set", "Ana"
    )
    _as(identity, "org_ev_set_mem", "user_ev_set_mem")

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "Sin sujeto",
                "date": "2030-08-02",
                "event_type_id": type_id,
            },
        )
    ).json()

    resp = await auth_client.patch(
        f"/events/{created['id']}", json={"member_id": ana_id}
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["member_id"] == ana_id
    assert body["member"] == {"id": ana_id, "display_name": "Ana"}


async def test_update_event_member_not_in_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    """PATCH con member_id de OTRA Familia → 403."""
    _as(identity, "org_ev_own", "user_ev_own")
    type_id = await _get_event_type_id(auth_client)

    created = (
        await auth_client.post(
            "/events",
            json={"title": "Mío", "date": "2030-08-03", "event_type_id": type_id},
        )
    ).json()

    other_id = await _materialize_member(
        auth_client, identity, "org_ev_foreign", "user_foreign", "Otro"
    )
    _as(identity, "org_ev_own", "user_ev_own")

    resp = await auth_client.patch(
        f"/events/{created['id']}", json={"member_id": other_id}
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "El Miembro no pertenece a esta Familia"


async def test_update_event_clear_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """PATCH con member_id: null → 200, desasigna al Miembro."""
    _as(identity, "org_ev_clr", "user_ev_clr")
    type_id = await _get_event_type_id(auth_client)

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_clr", "user_ana_clr", "Ana"
    )
    _as(identity, "org_ev_clr", "user_ev_clr")

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "De Ana",
                "date": "2030-08-04",
                "event_type_id": type_id,
                "member_id": ana_id,
            },
        )
    ).json()
    assert created["member_id"] == ana_id

    resp = await auth_client.patch(f"/events/{created['id']}", json={"member_id": None})
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["member_id"] is None
    assert body["member"] is None


async def test_update_event_omit_member_keeps_it(
    auth_client: AsyncClient, identity: dict
) -> None:
    """PATCH sin member_id en el body deja el Miembro asignado intacto."""
    _as(identity, "org_ev_keep", "user_ev_keep")
    type_id = await _get_event_type_id(auth_client)

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_keep", "user_ana_keep", "Ana"
    )
    _as(identity, "org_ev_keep", "user_ev_keep")

    created = (
        await auth_client.post(
            "/events",
            json={
                "title": "De Ana",
                "date": "2030-08-05",
                "event_type_id": type_id,
                "member_id": ana_id,
            },
        )
    ).json()

    resp = await auth_client.patch(
        f"/events/{created['id']}", json={"title": "Nuevo título"}
    )
    assert resp.status_code == 200, resp.json()
    body = resp.json()
    assert body["title"] == "Nuevo título"
    assert body["member_id"] == ana_id
    assert body["member"] == {"id": ana_id, "display_name": "Ana"}


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


# ---------- Sujeto Miembro ----------


async def test_create_event_with_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /events con member_id de un Miembro de la Familia → 201 con Miembro."""
    _as(identity, "org_ev_member", "user_ev_member")
    type_id = await _get_event_type_id(auth_client)

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_member", "user_ana", "Ana"
    )
    # Volver al Miembro creador para crear el Evento.
    _as(identity, "org_ev_member", "user_ev_member")

    resp = await auth_client.post(
        "/events",
        json={
            "title": "Reunión Ana",
            "date": "2030-05-10",
            "event_type_id": type_id,
            "member_id": ana_id,
        },
    )
    assert resp.status_code == 201, resp.json()
    body = resp.json()
    assert body["member_id"] == ana_id
    assert body["member"] == {"id": ana_id, "display_name": "Ana"}
    assert body["child_id"] is None
    assert body["child"] is None


async def test_create_event_member_not_in_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST con member_id de un Miembro de OTRA Familia → 403."""
    _as(identity, "org_ev_mine", "user_ev_mine")
    type_id = await _get_event_type_id(auth_client)

    # Miembro materializado en otra Familia.
    other_id = await _materialize_member(
        auth_client, identity, "org_ev_other", "user_other", "Otro"
    )
    # Volver a la Familia propia.
    _as(identity, "org_ev_mine", "user_ev_mine")

    resp = await auth_client.post(
        "/events",
        json={
            "title": "Conexión ilegal",
            "date": "2030-05-11",
            "event_type_id": type_id,
            "member_id": other_id,
        },
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "El Miembro no pertenece a esta Familia"


async def test_create_event_with_child_and_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST con child_id y member_id a la vez → 201 (ambos sujetos permitidos)."""
    _as(identity, "org_ev_both", "user_ev_both")
    type_id = await _get_event_type_id(auth_client)
    child_id = await _create_child(auth_client, "Lucía")

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_both", "user_ana2", "Ana"
    )
    _as(identity, "org_ev_both", "user_ev_both")

    resp = await auth_client.post(
        "/events",
        json={
            "title": "Evento mixto",
            "date": "2030-05-12",
            "event_type_id": type_id,
            "child_id": child_id,
            "member_id": ana_id,
        },
    )
    assert resp.status_code == 201, resp.json()
    body = resp.json()
    assert body["child_id"] == child_id
    assert body["child"] is not None
    assert body["child"]["name"] == "Lucía"
    assert body["member_id"] == ana_id
    assert body["member"] == {"id": ana_id, "display_name": "Ana"}


async def test_list_events_filter_by_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /events?member_id=<id> devuelve SOLO los Eventos de ese Miembro."""
    _as(identity, "org_ev_fmem", "user_ev_fmem")
    types = (await auth_client.get("/event-types")).json()
    medico = next(t for t in types if t["name"] == "Médico")

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_fmem", "user_ana_f", "Ana"
    )
    beto_id = await _materialize_member(
        auth_client, identity, "org_ev_fmem", "user_beto_f", "Beto"
    )
    _as(identity, "org_ev_fmem", "user_ev_fmem")

    # Evento familiar sin sujeto.
    family_resp = await auth_client.post(
        "/events",
        json={"title": "Familiar", "date": "2030-05-20", "event_type_id": medico["id"]},
    )
    assert family_resp.status_code == 201
    ana_resp = await auth_client.post(
        "/events",
        json={
            "title": "De Ana",
            "date": "2030-05-21",
            "event_type_id": medico["id"],
            "member_id": ana_id,
        },
    )
    assert ana_resp.status_code == 201
    beto_resp = await auth_client.post(
        "/events",
        json={
            "title": "De Beto",
            "date": "2030-05-22",
            "event_type_id": medico["id"],
            "member_id": beto_id,
        },
    )
    assert beto_resp.status_code == 201

    listed = (await auth_client.get(f"/events?member_id={ana_id}")).json()
    ids = {e["id"] for e in listed}
    assert ana_resp.json()["id"] in ids
    assert beto_resp.json()["id"] not in ids
    assert family_resp.json()["id"] not in ids
    assert all(e["member_id"] == ana_id for e in listed)


async def test_list_events_filter_member_and_type(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /events?member_id=<id>&type_id=<id> devuelve la intersección."""
    _as(identity, "org_ev_fmt", "user_ev_fmt")
    types = (await auth_client.get("/event-types")).json()
    medico = next(t for t in types if t["name"] == "Médico")
    cole = next(t for t in types if t["name"] == "Cole")

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_fmt", "user_ana_ft", "Ana"
    )
    _as(identity, "org_ev_fmt", "user_ev_fmt")

    # Ana tiene un evento Médico y uno Cole.
    ana_med = await auth_client.post(
        "/events",
        json={
            "title": "Ana Médico",
            "date": "2030-06-01",
            "event_type_id": medico["id"],
            "member_id": ana_id,
        },
    )
    assert ana_med.status_code == 201
    ana_cole = await auth_client.post(
        "/events",
        json={
            "title": "Ana Cole",
            "date": "2030-06-02",
            "event_type_id": cole["id"],
            "member_id": ana_id,
        },
    )
    assert ana_cole.status_code == 201

    listed = (
        await auth_client.get(f"/events?member_id={ana_id}&type_id={medico['id']}")
    ).json()
    ids = {e["id"] for e in listed}
    assert ana_med.json()["id"] in ids
    assert ana_cole.json()["id"] not in ids
    assert all(e["member_id"] == ana_id for e in listed)
    assert all(e["event_type"]["name"] == "Médico" for e in listed)


async def test_list_events_includes_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /events incluye Miembro expandido; los sin sujeto siguen con member null."""
    _as(identity, "org_ev_list", "user_ev_list")
    type_id = await _get_event_type_id(auth_client)

    # Evento familiar sin sujeto.
    family_resp = await auth_client.post(
        "/events",
        json={"title": "Familiar", "date": "2030-05-13", "event_type_id": type_id},
    )
    assert family_resp.status_code == 201

    ana_id = await _materialize_member(
        auth_client, identity, "org_ev_list", "user_ana3", "Ana"
    )
    _as(identity, "org_ev_list", "user_ev_list")

    member_resp = await auth_client.post(
        "/events",
        json={
            "title": "De Ana",
            "date": "2030-05-14",
            "event_type_id": type_id,
            "member_id": ana_id,
        },
    )
    assert member_resp.status_code == 201

    listed = (await auth_client.get("/events")).json()
    member_event = next(e for e in listed if e["id"] == member_resp.json()["id"])
    assert member_event["member_id"] == ana_id
    assert member_event["member"] == {"id": ana_id, "display_name": "Ana"}

    family_event = next(e for e in listed if e["id"] == family_resp.json()["id"])
    assert family_event["member_id"] is None
    assert family_event["member"] is None
