"""Costura HTTP/REST: CRUD de Visitas médicas con JSONB en Postgres real."""

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _create_child(
    client: AsyncClient, name: str = "Mateo", birth_date: str = "2020-03-15"
) -> str:
    resp = await client.post("/children", json={"name": name, "birth_date": birth_date})
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_health_visits_crud(auth_client: AsyncClient, identity: dict) -> None:
    """CRUD completo: crear, listar, detalle, editar, borrar."""
    _as(identity, "org_hv_crud", "user_hv_1")
    child_id = await _create_child(auth_client)

    # Crear una Visita con notas como string
    resp = await auth_client.post(
        f"/children/{child_id}/health-visits",
        json={
            "visited_at": "2026-06-12",
            "diagnosis": "Otitis media aguda",
            "notes": "Prescribe Amoxicilina 7 días.",
        },
    )
    assert resp.status_code == 201
    created = resp.json()
    visit_id = created["id"]
    assert created["diagnosis"] == "Otitis media aguda"
    assert created["notes"] == "Prescribe Amoxicilina 7 días."
    assert created["child_id"] == child_id
    assert created["family_id"] == "org_hv_crud"
    assert created["created_by"] == "user_hv_1"
    assert created["pauta_ids"] == []

    # Listar
    listed = (await auth_client.get(f"/children/{child_id}/health-visits")).json()
    assert len(listed) == 1
    assert listed[0]["id"] == visit_id

    # Detalle
    detail = (
        await auth_client.get(f"/children/{child_id}/health-visits/{visit_id}")
    ).json()
    assert detail["diagnosis"] == "Otitis media aguda"
    assert detail["notes"] == "Prescribe Amoxicilina 7 días."

    # Editar (corrección parcial)
    edited = await auth_client.patch(
        f"/children/{child_id}/health-visits/{visit_id}",
        json={"diagnosis": "Otitis media leve"},
    )
    assert edited.status_code == 200
    assert edited.json()["diagnosis"] == "Otitis media leve"
    assert edited.json()["notes"] == "Prescribe Amoxicilina 7 días."

    # Borrar
    deleted = await auth_client.delete(f"/children/{child_id}/health-visits/{visit_id}")
    assert deleted.status_code == 204
    assert (await auth_client.get(f"/children/{child_id}/health-visits")).json() == []


async def test_health_visits_jsonb_object(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Las notas JSONB se persisten y recuperan como objeto estructurado."""
    _as(identity, "org_hv_jsonb", "user_hv_jsonb")
    child_id = await _create_child(auth_client)

    notes_obj = {"tratamiento": "Amoxicilina 5ml", "control": "2 semanas"}
    resp = await auth_client.post(
        f"/children/{child_id}/health-visits",
        json={
            "visited_at": "2026-06-10",
            "diagnosis": "Bronquitis",
            "notes": notes_obj,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] == notes_obj

    # Recuperar vía detalle
    visit_id = resp.json()["id"]
    detail = (
        await auth_client.get(f"/children/{child_id}/health-visits/{visit_id}")
    ).json()
    assert detail["notes"] == notes_obj


async def test_health_visits_null_notes(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Las notas pueden ser null (no obligatorias)."""
    _as(identity, "org_hv_null", "user_hv_null")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        f"/children/{child_id}/health-visits",
        json={"visited_at": "2026-01-15", "diagnosis": "Control rutinario"},
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] is None


async def test_health_visits_date_filter(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Filtro por rango de fechas en el listado."""
    _as(identity, "org_hv_filter", "user_hv_filter")
    child_id = await _create_child(auth_client)

    for d in ["2026-01-10", "2026-03-15", "2026-06-01"]:
        await auth_client.post(
            f"/children/{child_id}/health-visits",
            json={"visited_at": d, "diagnosis": f"Visita {d}"},
        )

    # Solo las de marzo en adelante
    filtered = (
        await auth_client.get(
            f"/children/{child_id}/health-visits?from=2026-03-01&to=2026-04-01"
        )
    ).json()
    assert len(filtered) == 1
    assert filtered[0]["visited_at"] == "2026-03-15"


async def test_health_visits_order_desc(
    auth_client: AsyncClient, identity: dict
) -> None:
    """El listado devuelve las visitas más recientes primero."""
    _as(identity, "org_hv_order", "user_hv_order")
    child_id = await _create_child(auth_client)

    for d in ["2025-01-01", "2026-06-01", "2025-06-15"]:
        await auth_client.post(
            f"/children/{child_id}/health-visits",
            json={"visited_at": d, "diagnosis": f"Visita {d}"},
        )

    listed = (await auth_client.get(f"/children/{child_id}/health-visits")).json()
    dates = [v["visited_at"] for v in listed]
    assert dates == ["2026-06-01", "2025-06-15", "2025-01-01"]


async def test_health_visits_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Visitas de una Familia no son visibles desde otra (RLS)."""
    _as(identity, "org_hv_a", "user_hv_a")
    child_id = await _create_child(auth_client)
    await auth_client.post(
        f"/children/{child_id}/health-visits",
        json={"visited_at": "2026-06-12", "diagnosis": "Privada"},
    )

    # Otra Familia no ve ni el Hijo ni la Visita
    _as(identity, "org_hv_b", "user_hv_b")
    resp = await auth_client.get(f"/children/{child_id}/health-visits")
    assert resp.status_code == 404  # El Hijo no existe para esta Familia


async def test_health_visits_404_wrong_child(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Acceder a una Visita con un child_id inexistente da 404."""
    _as(identity, "org_hv_404", "user_hv_404")
    fake_child = "00000000-0000-0000-0000-000000000000"
    resp = await auth_client.get(f"/children/{fake_child}/health-visits")
    assert resp.status_code == 404
