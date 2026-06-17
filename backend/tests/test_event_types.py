from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_list_returns_system_types(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /event-types devuelve los 5 tipos base del sistema."""
    _as(identity, "org_et_list", "user_et_list")

    resp = await auth_client.get("/event-types")
    assert resp.status_code == 200
    types = resp.json()
    system = [t for t in types if t["is_system"]]
    assert len(system) == 5
    names = {t["name"] for t in system}
    assert names == {"Médico", "Cole", "Extraescolar", "Trámite", "Otros"}
    # Todos los base tienen family_id = null.
    assert all(t["family_id"] is None for t in system)


async def test_crud_custom_event_type(auth_client: AsyncClient, identity: dict) -> None:
    """Ciclo completo: crear, listar, editar y borrar un tipo personalizado."""
    _as(identity, "org_et_crud", "user_et_crud")

    # Crear tipo personalizado.
    resp = await auth_client.post(
        "/event-types", json={"name": "Cumpleaños", "icon": "cake"}
    )
    assert resp.status_code == 201
    created = resp.json()
    type_id = created["id"]
    assert created["name"] == "Cumpleaños"
    assert created["icon"] == "cake"
    assert created["is_system"] is False
    assert created["family_id"] == "org_et_crud"

    # Listado incluye base + personalizado.
    listed = (await auth_client.get("/event-types")).json()
    custom = [t for t in listed if not t["is_system"]]
    assert any(t["id"] == type_id for t in custom)

    # Editar.
    resp = await auth_client.patch(
        f"/event-types/{type_id}", json={"name": "Fiesta", "icon": "party"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Fiesta"
    assert resp.json()["icon"] == "party"

    # Borrar.
    resp = await auth_client.delete(f"/event-types/{type_id}")
    assert resp.status_code == 204
    listed = (await auth_client.get("/event-types")).json()
    assert not any(t["id"] == type_id for t in listed)


async def test_system_types_not_editable(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Los tipos base no se pueden editar ni borrar."""
    _as(identity, "org_et_protect", "user_et_protect")

    types = (await auth_client.get("/event-types")).json()
    system_type = next(t for t in types if t["is_system"])

    # Editar → 403
    resp = await auth_client.patch(
        f"/event-types/{system_type['id']}", json={"name": "Hacked"}
    )
    assert resp.status_code == 403

    # Borrar → 403
    resp = await auth_client.delete(f"/event-types/{system_type['id']}")
    assert resp.status_code == 403


async def test_custom_types_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Los tipos personalizados de una Familia no son visibles para otra."""
    # Familia A crea un tipo personalizado.
    _as(identity, "org_et_a", "user_et_a")
    created = (await auth_client.post("/event-types", json={"name": "Yoga"})).json()
    type_id = created["id"]

    # Familia B no lo ve.
    _as(identity, "org_et_b", "user_et_b")
    listed = (await auth_client.get("/event-types")).json()
    assert not any(t["id"] == type_id for t in listed)

    # Familia B no puede editarlo ni borrarlo (RLS → 404).
    assert (
        await auth_client.patch(f"/event-types/{type_id}", json={"name": "Robo"})
    ).status_code == 404
    assert (await auth_client.delete(f"/event-types/{type_id}")).status_code == 404

    # Familia B sigue viendo los base.
    system = [t for t in listed if t["is_system"]]
    assert len(system) == 5


async def test_create_custom_type_default_icon(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Si no se pasa icon, se usa 'circle' por defecto."""
    _as(identity, "org_et_default", "user_et_default")

    resp = await auth_client.post("/event-types", json={"name": "Deporte"})
    assert resp.status_code == 201
    assert resp.json()["icon"] == "circle"


async def test_create_event_type_requires_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Sin Familia activa → 403."""
    identity.clear()
    identity.update({"sub": "user_no_org_et"})

    resp = await auth_client.post("/event-types", json={"name": "Sin Familia"})
    assert resp.status_code == 403
