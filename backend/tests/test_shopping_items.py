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


async def test_buy_sets_status_and_attribution(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST .../buy marca bought, fija bought_by/bought_at del JWT."""
    _as(identity, "org_buy_a", "user_buy_a1")
    created = (
        await auth_client.post("/api/shopping-items", json={"text": "Yogures"})
    ).json()
    item_id = created["id"]

    # Tachar.
    resp = await auth_client.post(f"/api/shopping-items/{item_id}/buy")
    assert resp.status_code == 200
    bought = resp.json()
    assert bought["status"] == "bought"
    assert bought["bought_by"] == "user_buy_a1"
    assert bought["bought_at"] is not None
    # El Ítem se conserva (no se borra).
    assert bought["text"] == "Yogures"
    assert bought["id"] == item_id


async def test_undo_clears_attribution(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST .../undo vuelve a pending y limpia bought_by/bought_at."""
    _as(identity, "org_undo_a", "user_undo_a1")
    created = (
        await auth_client.post("/api/shopping-items", json={"text": "Galletas"})
    ).json()
    item_id = created["id"]

    # Comprar y luego deshacer.
    await auth_client.post(f"/api/shopping-items/{item_id}/buy")
    resp = await auth_client.post(f"/api/shopping-items/{item_id}/undo")
    assert resp.status_code == 200
    undone = resp.json()
    assert undone["status"] == "pending"
    assert undone["bought_by"] is None
    assert undone["bought_at"] is None


async def test_buy_attribution_uses_jwt_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """La atribución usa el Miembro del JWT, no un valor del cliente."""
    _as(identity, "org_attr", "user_attr_creator")
    created = (
        await auth_client.post("/api/shopping-items", json={"text": "Café"})
    ).json()
    item_id = created["id"]

    # Otro Miembro de la misma Familia lo tacha.
    _as(identity, "org_attr", "user_attr_buyer")
    resp = await auth_client.post(f"/api/shopping-items/{item_id}/buy")
    assert resp.status_code == 200
    bought = resp.json()
    assert bought["bought_by"] == "user_attr_buyer"
    assert bought["created_by"] == "user_attr_creator"


async def test_list_returns_pending_and_bought(
    auth_client: AsyncClient, identity: dict
) -> None:
    """El listado devuelve tanto pendientes como comprados."""
    _as(identity, "org_list_both", "user_list_both")
    await auth_client.post("/api/shopping-items", json={"text": "Agua"})
    r2 = (await auth_client.post("/api/shopping-items", json={"text": "Zumo"})).json()

    # Comprar solo uno.
    await auth_client.post(f"/api/shopping-items/{r2['id']}/buy")

    listed = (await auth_client.get("/api/shopping-items")).json()
    texts = {i["text"]: i["status"] for i in listed}
    assert texts["Agua"] == "pending"
    assert texts["Zumo"] == "bought"


async def test_buy_undo_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS impide que otra Familia tache un Ítem ajeno (404)."""
    _as(identity, "org_iso_buy_a", "user_iso_buy_a1")
    created = (
        await auth_client.post("/api/shopping-items", json={"text": "Arroz"})
    ).json()
    item_id = created["id"]

    # Familia B no puede tachar el Ítem de A.
    _as(identity, "org_iso_buy_b", "user_iso_buy_b1")
    resp = await auth_client.post(f"/api/shopping-items/{item_id}/buy")
    assert resp.status_code == 404

    # Tampoco deshacer.
    resp = await auth_client.post(f"/api/shopping-items/{item_id}/undo")
    assert resp.status_code == 404


async def test_buy_nonexistent_returns_404(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_404_buy", "user_404_buy")
    resp = await auth_client.post(
        "/api/shopping-items/00000000-0000-0000-0000-000000000000/buy"
    )
    assert resp.status_code == 404
