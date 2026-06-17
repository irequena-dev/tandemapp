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


# ---------- avatar_color ----------


async def test_create_child_with_valid_avatar_color(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Alta con un color de la paleta acotada: se persiste y se devuelve."""
    _as(identity, "org_color_1", "user_color_1")
    resp = await auth_client.post(
        "/children",
        json={"name": "Luna", "birth_date": "2021-03-10", "avatar_color": "sage"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["avatar_color"] == "sage"

    # También aparece en el listado.
    listed = (await auth_client.get("/children")).json()
    assert listed[0]["avatar_color"] == "sage"


async def test_create_child_without_avatar_color(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Alta sin color: se persiste como null (el frontend usa fallback por id)."""
    _as(identity, "org_color_2", "user_color_2")
    resp = await auth_client.post(
        "/children", json={"name": "Sol", "birth_date": "2022-06-01"}
    )
    assert resp.status_code == 201
    assert resp.json()["avatar_color"] is None


async def test_create_child_with_invalid_avatar_color(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Color fuera de la paleta → 422."""
    _as(identity, "org_color_3", "user_color_3")
    resp = await auth_client.post(
        "/children",
        json={"name": "Nube", "birth_date": "2020-01-01", "avatar_color": "purple"},
    )
    assert resp.status_code == 422


async def test_update_child_avatar_color(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Editar el color de un Hijo existente."""
    _as(identity, "org_color_4", "user_color_4")
    child_id = (
        await auth_client.post(
            "/children",
            json={"name": "Río", "birth_date": "2019-08-15", "avatar_color": "clay"},
        )
    ).json()["id"]

    # Cambiar el color.
    resp = await auth_client.patch(
        f"/children/{child_id}", json={"avatar_color": "ochre"}
    )
    assert resp.status_code == 200
    assert resp.json()["avatar_color"] == "ochre"

    # Poner a null (quitar color explícito → fallback por id).
    resp = await auth_client.patch(f"/children/{child_id}", json={"avatar_color": None})
    assert resp.status_code == 200
    assert resp.json()["avatar_color"] is None


async def test_update_child_invalid_avatar_color(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Editar con un color inválido → 422."""
    _as(identity, "org_color_5", "user_color_5")
    child_id = (
        await auth_client.post(
            "/children", json={"name": "Mar", "birth_date": "2020-02-20"}
        )
    ).json()["id"]

    resp = await auth_client.patch(
        f"/children/{child_id}", json={"avatar_color": "neon"}
    )
    assert resp.status_code == 422
