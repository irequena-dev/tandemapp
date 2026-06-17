from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _create_child(client: AsyncClient, name: str, birth_date: str) -> str:
    resp = await client.post("/children", json={"name": name, "birth_date": birth_date})
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_measurement_crud(auth_client: AsyncClient, identity: dict) -> None:
    """Alta, listado, edición y borrado de una Medida."""
    _as(identity, "org_med", "user_med_1")
    child_id = await _create_child(auth_client, "Mara", "2020-05-01")

    # Alta
    resp = await auth_client.post(
        f"/children/{child_id}/measurements",
        json={
            "type": "height",
            "value": 95.0,
            "unit": "cm",
            "measured_at": "2025-06-01",
        },
    )
    assert resp.status_code == 201
    m = resp.json()
    mid = m["id"]
    assert m["type"] == "height"
    assert m["value"] == 95.0
    assert m["unit"] == "cm"
    assert m["measured_at"] == "2025-06-01"
    assert m["recorded_by"] == "user_med_1"

    # Listado
    listed = (await auth_client.get(f"/children/{child_id}/measurements")).json()
    assert len(listed) == 1
    assert listed[0]["id"] == mid

    # Edición (corrección de valor)
    patched = await auth_client.patch(
        f"/children/{child_id}/measurements/{mid}",
        json={"value": 96.0},
    )
    assert patched.status_code == 200
    assert patched.json()["value"] == 96.0
    assert patched.json()["measured_at"] == "2025-06-01"  # sin cambio

    # Borrado
    deleted = await auth_client.delete(f"/children/{child_id}/measurements/{mid}")
    assert deleted.status_code == 204
    assert (await auth_client.get(f"/children/{child_id}/measurements")).json() == []


async def test_append_only_and_current(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Múltiples Medidas del mismo tipo se conservan;
    current devuelve la más reciente.
    """
    _as(identity, "org_append", "user_append_1")
    child_id = await _create_child(auth_client, "Leo", "2021-01-01")

    # Crear 3 alturas en distintas fechas
    for date, val in [("2025-01-01", 80.0), ("2025-06-01", 85.0), ("2025-12-01", 90.0)]:
        resp = await auth_client.post(
            f"/children/{child_id}/measurements",
            json={"type": "height", "value": val, "unit": "cm", "measured_at": date},
        )
        assert resp.status_code == 201

    # Crear 1 peso
    resp = await auth_client.post(
        f"/children/{child_id}/measurements",
        json={
            "type": "weight",
            "value": 12.5,
            "unit": "kg",
            "measured_at": "2025-12-01",
        },
    )
    assert resp.status_code == 201

    # Listado completo: las 4 se conservan
    all_m = (await auth_client.get(f"/children/{child_id}/measurements")).json()
    assert len(all_m) == 4

    # Filtro por tipo: solo alturas
    heights = (
        await auth_client.get(f"/children/{child_id}/measurements?type=height")
    ).json()
    assert len(heights) == 3
    # Ordenadas de más reciente a más antigua
    assert [h["value"] for h in heights] == [90.0, 85.0, 80.0]

    # Current: la más reciente de cada tipo
    current = (
        await auth_client.get(f"/children/{child_id}/measurements/current")
    ).json()
    assert current["height"]["value"] == 90.0
    assert current["height"]["measured_at"] == "2025-12-01"
    assert current["weight"]["value"] == 12.5


async def test_measurements_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS aísla las Medidas entre Familias."""
    _as(identity, "org_iso_a", "user_iso_a1")
    child_a = await _create_child(auth_client, "Hijo A", "2019-01-01")
    resp = await auth_client.post(
        f"/children/{child_a}/measurements",
        json={
            "type": "height",
            "value": 100.0,
            "unit": "cm",
            "measured_at": "2025-06-01",
        },
    )
    assert resp.status_code == 201
    mid = resp.json()["id"]

    # La Familia B no ve el Hijo ni las Medidas
    _as(identity, "org_iso_b", "user_iso_b1")
    resp = await auth_client.get(f"/children/{child_a}/measurements")
    assert resp.status_code == 404

    # No puede editar ni borrar
    assert (
        await auth_client.patch(
            f"/children/{child_a}/measurements/{mid}", json={"value": 999}
        )
    ).status_code == 404
    assert (
        await auth_client.delete(f"/children/{child_a}/measurements/{mid}")
    ).status_code == 404

    # Familia A ve la Medida intacta
    _as(identity, "org_iso_a", "user_iso_a1")
    listed = (await auth_client.get(f"/children/{child_a}/measurements")).json()
    assert len(listed) == 1
    assert listed[0]["value"] == 100.0


async def test_current_empty(auth_client: AsyncClient, identity: dict) -> None:
    """Current devuelve null para tipos sin Medidas."""
    _as(identity, "org_empty", "user_empty_1")
    child_id = await _create_child(auth_client, "Sin Medidas", "2022-01-01")
    current = (
        await auth_client.get(f"/children/{child_id}/measurements/current")
    ).json()
    assert current["height"] is None
    assert current["weight"] is None
