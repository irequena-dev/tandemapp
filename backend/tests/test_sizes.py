"""Tests de la costura HTTP/REST para Tallas (sizes) — append-only."""

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _create_child(
    auth_client: AsyncClient, name: str = "Mateo", birth_date: str = "2020-03-15"
) -> str:
    resp = await auth_client.post(
        "/children", json={"name": name, "birth_date": birth_date}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------- CRUD ----------


async def test_sizes_crud(auth_client: AsyncClient, identity: dict) -> None:
    _as(identity, "org_sz_crud", "user_sz_1")
    child_id = await _create_child(auth_client)

    # Alta de Talla (clothing)
    resp = await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "clothing", "label": "5-6 años", "recorded_at": "2026-06-01"},
    )
    assert resp.status_code == 201
    created = resp.json()
    size_id = created["id"]
    assert created["type"] == "clothing"
    assert created["label"] == "5-6 años"
    assert created["recorded_at"] == "2026-06-01"
    assert created["recorded_by"] == "user_sz_1"
    assert created["child_id"] == child_id

    # Listado
    listed = (await auth_client.get(f"/children/{child_id}/sizes")).json()
    assert len(listed) == 1
    assert listed[0]["id"] == size_id

    # Edición (corregir label)
    edited = await auth_client.patch(
        f"/children/{child_id}/sizes/{size_id}", json={"label": "6 años"}
    )
    assert edited.status_code == 200
    assert edited.json()["label"] == "6 años"

    # Baja
    deleted = await auth_client.delete(f"/children/{child_id}/sizes/{size_id}")
    assert deleted.status_code == 204
    assert (await auth_client.get(f"/children/{child_id}/sizes")).json() == []


# ---------- Filtro por type ----------


async def test_sizes_filter_by_type(auth_client: AsyncClient, identity: dict) -> None:
    _as(identity, "org_sz_filter", "user_sz_f")
    child_id = await _create_child(auth_client)

    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "clothing", "label": "5-6 años", "recorded_at": "2026-06-01"},
    )
    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "footwear", "label": "29", "recorded_at": "2026-06-01"},
    )

    all_sizes = (await auth_client.get(f"/children/{child_id}/sizes")).json()
    assert len(all_sizes) == 2

    clothing = (
        await auth_client.get(f"/children/{child_id}/sizes?type=clothing")
    ).json()
    assert len(clothing) == 1
    assert clothing[0]["type"] == "clothing"

    footwear = (
        await auth_client.get(f"/children/{child_id}/sizes?type=footwear")
    ).json()
    assert len(footwear) == 1
    assert footwear[0]["type"] == "footwear"


# ---------- Append-only + current ----------


async def test_sizes_append_only_and_current(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_sz_append", "user_sz_a")
    child_id = await _create_child(auth_client)

    # Registro de varias tallas del mismo tipo
    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "clothing", "label": "4 años", "recorded_at": "2025-12-01"},
    )
    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "clothing", "label": "5-6 años", "recorded_at": "2026-06-01"},
    )
    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "footwear", "label": "28", "recorded_at": "2025-12-01"},
    )
    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "footwear", "label": "29", "recorded_at": "2026-06-01"},
    )

    # Todas se conservan (append-only)
    all_sizes = (await auth_client.get(f"/children/{child_id}/sizes")).json()
    assert len(all_sizes) == 4

    # current devuelve la más reciente por tipo
    current = (await auth_client.get(f"/children/{child_id}/sizes/current")).json()
    assert current["clothing"]["label"] == "5-6 años"
    assert current["footwear"]["label"] == "29"


async def test_sizes_current_empty(auth_client: AsyncClient, identity: dict) -> None:
    _as(identity, "org_sz_empty", "user_sz_e")
    child_id = await _create_child(auth_client)

    current = (await auth_client.get(f"/children/{child_id}/sizes/current")).json()
    assert current["clothing"] is None
    assert current["footwear"] is None


# ---------- Aislamiento entre Familias ----------


async def test_sizes_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    # Familia A crea un Hijo y una Talla
    _as(identity, "org_sz_a", "user_sz_a1")
    child_id = await _create_child(auth_client)
    resp = await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "clothing", "label": "4 años", "recorded_at": "2025-12-01"},
    )
    size_id = resp.json()["id"]

    # Familia B no ve el Hijo (RLS)
    _as(identity, "org_sz_b", "user_sz_b1")
    assert (await auth_client.get(f"/children/{child_id}/sizes")).status_code == 404

    # No puede editar ni borrar
    assert (
        await auth_client.patch(
            f"/children/{child_id}/sizes/{size_id}", json={"label": "robado"}
        )
    ).status_code == 404
    assert (
        await auth_client.delete(f"/children/{child_id}/sizes/{size_id}")
    ).status_code == 404

    # El dato de A sigue intacto
    _as(identity, "org_sz_a", "user_sz_a1")
    sizes = (await auth_client.get(f"/children/{child_id}/sizes")).json()
    assert sizes[0]["label"] == "4 años"


# ---------- Validación ----------


async def test_sizes_invalid_type_rejected(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_sz_val", "user_sz_v")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "hat", "label": "M", "recorded_at": "2026-06-01"},
    )
    assert resp.status_code == 422


async def test_sizes_requires_auth(auth_client: AsyncClient, identity: dict) -> None:
    _as(identity, "org_sz_auth", "user_sz_auth")
    child_id = await _create_child(auth_client)

    # Clear identity to simulate unauthenticated request
    identity.clear()
    resp = await auth_client.get(f"/children/{child_id}/sizes")
    assert resp.status_code == 401
