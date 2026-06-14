from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_children_crud_via_rest(auth_client: AsyncClient, identity: dict) -> None:
    _as(identity, "org_crud", "user_crud_1")

    # Alta
    resp = await auth_client.post(
        "/children", json={"name": "Mara", "birth_date": "2020-05-01"}
    )
    assert resp.status_code == 201
    created = resp.json()
    child_id = created["id"]
    assert created["name"] == "Mara"
    assert created["birth_date"] == "2020-05-01"
    # El servidor impone el family_id del contexto.
    assert created["family_id"] == "org_crud"

    # Listado
    listed = (await auth_client.get("/children")).json()
    assert [c["id"] for c in listed] == [child_id]

    # Edición parcial (corregir el nombre, conservar la fecha)
    edited = await auth_client.patch(f"/children/{child_id}", json={"name": "Mara Lúa"})
    assert edited.status_code == 200
    assert edited.json()["name"] == "Mara Lúa"
    assert edited.json()["birth_date"] == "2020-05-01"

    # Baja
    deleted = await auth_client.delete(f"/children/{child_id}")
    assert deleted.status_code == 204
    assert (await auth_client.get("/children")).json() == []


async def test_children_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    # La Familia A da de alta un Hijo.
    _as(identity, "org_ch_a", "user_ch_a1")
    child_id = (
        await auth_client.post(
            "/children", json={"name": "Hijo A", "birth_date": "2019-01-01"}
        )
    ).json()["id"]

    # La Familia B no lo ve en su listado...
    _as(identity, "org_ch_b", "user_ch_b1")
    assert (await auth_client.get("/children")).json() == []

    # ...ni puede editarlo o borrarlo (RLS lo oculta → 404, nunca 403).
    assert (
        await auth_client.patch(f"/children/{child_id}", json={"name": "robado"})
    ).status_code == 404
    assert (await auth_client.delete(f"/children/{child_id}")).status_code == 404

    # El Hijo de A sigue intacto.
    _as(identity, "org_ch_a", "user_ch_a1")
    still = (await auth_client.get("/children")).json()
    assert [c["name"] for c in still] == ["Hijo A"]


async def test_create_child_requires_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    # Autenticado pero sin Organización activa: no hay Familia donde crear.
    identity.clear()
    identity.update({"sub": "user_no_org_child"})
    resp = await auth_client.post(
        "/children", json={"name": "Fantasma", "birth_date": "2021-01-01"}
    )
    assert resp.status_code == 403
