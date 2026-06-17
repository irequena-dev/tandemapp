from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _set_status(session: AsyncSession, item_id: str, status: str) -> None:
    """Fuerza el estado de un Ítem (admin session, bypasses RLS)."""
    await session.execute(
        text("UPDATE shopping_items SET status = :status WHERE id = :id"),
        {"status": status, "id": item_id},
    )
    await session.commit()


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


# ---------- Issue 03: editar, borrar, limpiar comprados ----------


async def test_patch_shopping_item_updates_text(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_shop_edit", "user_shop_edit1")
    created = (
        await auth_client.post("/api/shopping-items", json={"text": "Leche"})
    ).json()
    item_id = created["id"]

    resp = await auth_client.patch(
        f"/api/shopping-items/{item_id}", json={"text": "Leche desnatada"}
    )
    assert resp.status_code == 200
    updated = resp.json()
    assert updated["text"] == "Leche desnatada"
    assert updated["id"] == item_id

    # El listado refleja el texto editado.
    listed = (await auth_client.get("/api/shopping-items")).json()
    texts = [i["text"] for i in listed]
    assert "Leche desnatada" in texts
    assert "Leche" not in texts


async def test_patch_shopping_item_not_found(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_shop_edit_nf", "user_shop_edit_nf1")
    resp = await auth_client.patch(
        "/api/shopping-items/00000000-0000-0000-0000-000000000000",
        json={"text": "Fantasma"},
    )
    assert resp.status_code == 404


async def test_delete_shopping_item(auth_client: AsyncClient, identity: dict) -> None:
    _as(identity, "org_shop_del", "user_shop_del1")
    created = (
        await auth_client.post("/api/shopping-items", json={"text": "Pan"})
    ).json()
    item_id = created["id"]

    resp = await auth_client.delete(f"/api/shopping-items/{item_id}")
    assert resp.status_code == 204

    # Ya no aparece en el listado.
    listed = (await auth_client.get("/api/shopping-items")).json()
    assert not any(i["id"] == item_id for i in listed)


async def test_delete_shopping_item_not_found(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_shop_del_nf", "user_shop_del_nf1")
    resp = await auth_client.delete(
        "/api/shopping-items/00000000-0000-0000-0000-000000000000"
    )
    assert resp.status_code == 404


async def test_clear_bought_shopping_items(
    auth_client: AsyncClient, identity: dict, admin_session: AsyncSession
) -> None:
    """DELETE /api/shopping-items/bought elimina solo los comprados."""
    _as(identity, "org_shop_clear", "user_shop_clear1")

    item_a = (
        await auth_client.post("/api/shopping-items", json={"text": "Huevos"})
    ).json()
    await auth_client.post("/api/shopping-items", json={"text": "Yogur"})

    # Marcar item_a como bought vía sesión admin (bypasses RLS).
    await _set_status(admin_session, item_a["id"], "bought")

    resp = await auth_client.delete("/api/shopping-items/bought")
    assert resp.status_code == 204

    # Solo queda el pendiente (Yogur).
    listed = (await auth_client.get("/api/shopping-items")).json()
    texts = [i["text"] for i in listed]
    assert "Yogur" in texts
    assert "Huevos" not in texts


async def test_clear_bought_does_nothing_when_no_bought(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_shop_clear_empty", "user_shop_clear_empty1")
    await auth_client.post("/api/shopping-items", json={"text": "Pendiente"})

    resp = await auth_client.delete("/api/shopping-items/bought")
    assert resp.status_code == 204

    listed = (await auth_client.get("/api/shopping-items")).json()
    assert any(i["text"] == "Pendiente" for i in listed)


async def test_edit_delete_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Un Miembro de otra Familia no puede editar/borrar Ítems ajenos."""
    _as(identity, "org_shop_iso_ed_a", "user_shop_iso_ed_a1")
    created = (
        await auth_client.post("/api/shopping-items", json={"text": "Agua"})
    ).json()
    item_id = created["id"]

    # Familia B intenta editarlo → 404 (RLS oculta).
    _as(identity, "org_shop_iso_ed_b", "user_shop_iso_ed_b1")
    resp_edit = await auth_client.patch(
        f"/api/shopping-items/{item_id}", json={"text": "Hacked"}
    )
    assert resp_edit.status_code == 404

    # Familia B intenta borrarlo → 404.
    resp_del = await auth_client.delete(f"/api/shopping-items/{item_id}")
    assert resp_del.status_code == 404

    # El Ítem de A sigue intacto.
    _as(identity, "org_shop_iso_ed_a", "user_shop_iso_ed_a1")
    listed = (await auth_client.get("/api/shopping-items")).json()
    assert any(i["text"] == "Agua" and i["id"] == item_id for i in listed)


# ---------- Issue 02: tachar/deshacer con atribución ----------


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
