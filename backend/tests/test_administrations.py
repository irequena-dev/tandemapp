"""Tests para la costura HTTP/REST de Administraciones (dosis de una Pauta).

Cubre: registrar, guarda de duplicado (~15 min), listar, corregir, borrar
con recálculo de next_dose_at, aislamiento por Familia (RLS), y rechazo
en Pauta finalizada.
"""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id, "name": "Test User"})


async def _create_child(client: AsyncClient, name: str = "Mateo") -> str:
    resp = await client.post(
        "/children", json={"name": name, "birth_date": "2020-03-15"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def _create_pauta(client: AsyncClient, child_id: str) -> dict:
    resp = await client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Amoxicilina",
            "dose": "5 ml",
            "interval_hours": 8,
            "duration_days": 7,
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def test_create_administration_and_next_dose_at(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Registrar una Administración devuelve 201 y recalcula next_dose_at."""
    _as(identity, "org_admin_crud", "user_admin_1")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    # next_dose_at antes de cualquier Administración = started_at + interval
    assert pauta["next_dose_at"] is not None
    started = datetime.fromisoformat(pauta["started_at"])
    next_before = datetime.fromisoformat(pauta["next_dose_at"])
    assert next_before - started == timedelta(hours=8)

    # Registrar Administración
    resp = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert resp.status_code == 201
    admin = resp.json()
    assert admin["pauta_id"] == pauta_id
    assert admin["administered_by"] == "user_admin_1"
    assert admin["member_name"] == "Test User"
    assert "administered_at" in admin
    assert "created_at" in admin

    # next_dose_at se actualiza = administered_at + interval
    pauta_after = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    admin_at = datetime.fromisoformat(admin["administered_at"])
    next_after = datetime.fromisoformat(pauta_after["next_dose_at"])
    diff = next_after - admin_at
    assert abs(diff - timedelta(hours=8)) < timedelta(seconds=2)

    # todays_administrations incluye la nueva
    assert len(pauta_after["todays_administrations"]) == 1
    assert pauta_after["todays_administrations"][0]["id"] == admin["id"]


async def test_duplicate_guard_returns_existing(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Registrar dos veces dentro de ~15 min devuelve 200 con la existente."""
    _as(identity, "org_admin_dup", "user_admin_dup")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    # Primera → 201
    resp1 = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert resp1.status_code == 201
    admin1 = resp1.json()

    # Segunda dentro de la ventana → 200 con la misma
    resp2 = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert resp2.status_code == 200
    admin2 = resp2.json()
    assert admin2["id"] == admin1["id"]


async def test_duplicate_guard_allows_outside_window(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una Administración fuera de la ventana se crea normalmente (201)."""
    _as(identity, "org_admin_nodup", "user_admin_nodup")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    # Primera con administered_at explícito hace 1 hora
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    resp1 = await auth_client.post(
        f"/pautas/{pauta_id}/administrations",
        json={"administered_at": past},
    )
    assert resp1.status_code == 201

    # Segunda ahora → fuera de ventana → 201
    resp2 = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert resp2.status_code == 201
    assert resp2.json()["id"] != resp1.json()["id"]


async def test_list_administrations(auth_client: AsyncClient, identity: dict) -> None:
    """Listar Administraciones devuelve las de esa Pauta ordenadas desc."""
    _as(identity, "org_admin_list", "user_admin_list")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    # Crear dos separadas por >15 min
    t1 = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    t2 = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    await auth_client.post(
        f"/pautas/{pauta_id}/administrations",
        json={"administered_at": t1},
    )
    await auth_client.post(
        f"/pautas/{pauta_id}/administrations",
        json={"administered_at": t2},
    )

    resp = await auth_client.get(f"/pautas/{pauta_id}/administrations")
    assert resp.status_code == 200
    admins = resp.json()
    assert len(admins) == 2
    # Más reciente primero
    assert admins[0]["administered_at"] > admins[1]["administered_at"]


async def test_delete_administration_recalculates_next_dose(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Borrar la última Administración recalcula next_dose_at."""
    _as(identity, "org_admin_del", "user_admin_del")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    # Registrar dos administraciones separadas
    t1 = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    resp1 = await auth_client.post(
        f"/pautas/{pauta_id}/administrations",
        json={"administered_at": t1},
    )
    admin1 = resp1.json()

    t2 = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    resp2 = await auth_client.post(
        f"/pautas/{pauta_id}/administrations",
        json={"administered_at": t2},
    )
    admin2 = resp2.json()

    # next_dose_at basado en admin2 (la última)
    pauta_before = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    next_before = datetime.fromisoformat(pauta_before["next_dose_at"])
    admin2_at = datetime.fromisoformat(admin2["administered_at"])
    assert abs(next_before - (admin2_at + timedelta(hours=8))) < timedelta(seconds=2)

    # Borrar admin2
    del_resp = await auth_client.delete(
        f"/pautas/{pauta_id}/administrations/{admin2['id']}"
    )
    assert del_resp.status_code == 204

    # next_dose_at recalculado basado en admin1
    pauta_after = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    next_after = datetime.fromisoformat(pauta_after["next_dose_at"])
    admin1_at = datetime.fromisoformat(admin1["administered_at"])
    assert abs(next_after - (admin1_at + timedelta(hours=8))) < timedelta(seconds=2)


async def test_patch_administration(auth_client: AsyncClient, identity: dict) -> None:
    """Corregir una Administración actualiza administered_at."""
    _as(identity, "org_admin_patch", "user_admin_patch")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    resp = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    admin_id = resp.json()["id"]

    new_time = (datetime.now(UTC) - timedelta(hours=3)).isoformat()
    patch_resp = await auth_client.patch(
        f"/pautas/{pauta_id}/administrations/{admin_id}",
        json={"administered_at": new_time},
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.json()
    assert abs(
        datetime.fromisoformat(patched["administered_at"])
        - datetime.fromisoformat(new_time)
    ) < timedelta(seconds=2)


async def test_cannot_administer_finished_pauta(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Registrar una Administración en una Pauta finalizada → 409."""
    _as(identity, "org_admin_fin", "user_admin_fin")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    # Finalizar
    await auth_client.post(f"/pautas/{pauta_id}/finish")

    # Intentar registrar → 409
    resp = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert resp.status_code == 409


async def test_administrations_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS aísla las Administraciones entre Familias."""
    # Familia A crea Hijo, Pauta y Administración
    _as(identity, "org_admin_iso_a", "user_admin_iso_a")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    resp = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert resp.status_code == 201
    admin_id = resp.json()["id"]

    # Familia B no ve nada
    _as(identity, "org_admin_iso_b", "user_admin_iso_b")
    resp = await auth_client.get(f"/pautas/{pauta_id}/administrations")
    assert resp.status_code == 404
    assert (
        await auth_client.delete(f"/pautas/{pauta_id}/administrations/{admin_id}")
    ).status_code == 404


async def test_finished_pauta_next_dose_at_is_null(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Una Pauta finalizada tiene next_dose_at = null."""
    _as(identity, "org_admin_ndnull", "user_admin_ndnull")
    child_id = await _create_child(auth_client)
    pauta = await _create_pauta(auth_client, child_id)
    pauta_id = pauta["id"]

    await auth_client.post(f"/pautas/{pauta_id}/finish")
    detail = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    assert detail["next_dose_at"] is None
