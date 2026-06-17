from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_create_and_list_shopping_items(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_shop_a", "user_shop_a1")

    # Alta de un Ítem.
    resp = await auth_client.post("/api/shopping-items", json={"text": "Leche entera"})
    assert resp.status_code == 201
    created = resp.json()
    assert created["text"] == "Leche entera"
    assert created["status"] == "pending"
    assert created["family_id"] == "org_shop_a"
    assert created["created_by"] == "user_shop_a1"
    assert "id" in created
    assert "created_at" in created
    assert "updated_at" in created

    # Listado: contiene el ítem recién creado.
    listed = (await auth_client.get("/api/shopping-items")).json()
    assert len(listed) >= 1
    assert any(i["text"] == "Leche entera" for i in listed)


async def test_shopping_items_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    # Familia A crea un Ítem.
    _as(identity, "org_shop_iso_a", "user_shop_iso_a1")
    resp = await auth_client.post("/api/shopping-items", json={"text": "Pan de molde"})
    assert resp.status_code == 201

    # Familia B no ve los Ítems de A.
    _as(identity, "org_shop_iso_b", "user_shop_iso_b1")
    listed = (await auth_client.get("/api/shopping-items")).json()
    assert not any(i["text"] == "Pan de molde" for i in listed)

    # Familia B puede crear su propio Ítem.
    resp_b = await auth_client.post(
        "/api/shopping-items", json={"text": "Pañales talla 4"}
    )
    assert resp_b.status_code == 201
    assert resp_b.json()["family_id"] == "org_shop_iso_b"

    # A sigue sin ver el Ítem de B.
    _as(identity, "org_shop_iso_a", "user_shop_iso_a1")
    listed_a = (await auth_client.get("/api/shopping-items")).json()
    assert not any(i["text"] == "Pañales talla 4" for i in listed_a)


async def test_create_shopping_item_requires_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    identity.clear()
    identity.update({"sub": "user_no_org_shop"})
    resp = await auth_client.post("/api/shopping-items", json={"text": "Fantasma"})
    assert resp.status_code == 403
