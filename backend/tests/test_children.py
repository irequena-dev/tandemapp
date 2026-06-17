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


# ---------- include=current_metrics ----------


async def test_children_with_current_metrics(
    auth_client: AsyncClient, identity: dict
) -> None:
    """?include=current_metrics devuelve Hijos enriquecidos con métricas actuales."""
    _as(identity, "org_metrics_1", "user_metrics_1")

    # Crear un Hijo
    child_id = (
        await auth_client.post(
            "/children", json={"name": "Lucas", "birth_date": "2019-04-10"}
        )
    ).json()["id"]

    # Registrar medidas (dos de altura, una de peso) → actual = más reciente
    await auth_client.post(
        f"/children/{child_id}/measurements",
        json={"type": "height", "value": 90, "unit": "cm", "measured_at": "2023-01-01"},
    )
    await auth_client.post(
        f"/children/{child_id}/measurements",
        json={"type": "height", "value": 95, "unit": "cm", "measured_at": "2024-01-01"},
    )
    await auth_client.post(
        f"/children/{child_id}/measurements",
        json={
            "type": "weight",
            "value": 14.5,
            "unit": "kg",
            "measured_at": "2024-01-01",
        },
    )

    # Registrar tallas (ropa y calzado)
    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "clothing", "label": "5-6 años", "recorded_at": "2024-01-01"},
    )
    await auth_client.post(
        f"/children/{child_id}/sizes",
        json={"type": "footwear", "label": "28", "recorded_at": "2024-01-01"},
    )

    # Consultar con include=current_metrics
    resp = await auth_client.get("/children", params={"include": "current_metrics"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    child = data[0]

    assert child["id"] == child_id
    assert child["name"] == "Lucas"
    assert child["current_height_cm"] == 95
    assert child["current_weight_kg"] == 14.5
    assert child["current_talla"] == "5-6 años"
    assert child["current_talla_calzado"] == "28"


async def test_children_with_current_metrics_null_when_no_data(
    auth_client: AsyncClient, identity: dict
) -> None:
    """?include=current_metrics devuelve null para métricas sin datos."""
    _as(identity, "org_metrics_2", "user_metrics_2")

    # Crear un Hijo sin medidas ni tallas
    child_id = (
        await auth_client.post(
            "/children", json={"name": "Noa", "birth_date": "2021-06-15"}
        )
    ).json()["id"]

    resp = await auth_client.get("/children", params={"include": "current_metrics"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    child = data[0]

    assert child["id"] == child_id
    assert child["current_height_cm"] is None
    assert child["current_weight_kg"] is None
    assert child["current_talla"] is None
    assert child["current_talla_calzado"] is None


async def test_children_without_include_no_metrics(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Sin ?include=current_metrics, la respuesta no incluye campos de métricas."""
    _as(identity, "org_metrics_3", "user_metrics_3")

    await auth_client.post(
        "/children", json={"name": "Río", "birth_date": "2020-03-01"}
    )

    resp = await auth_client.get("/children")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert "current_height_cm" not in data[0]


async def test_children_metrics_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Las métricas de Hijos de otra Familia no se filtran."""
    # Familia A: hijo con medidas
    _as(identity, "org_metrics_iso_a", "user_metrics_iso_a")
    child_a = (
        await auth_client.post(
            "/children", json={"name": "Hijo A", "birth_date": "2019-01-01"}
        )
    ).json()["id"]
    await auth_client.post(
        f"/children/{child_a}/measurements",
        json={
            "type": "height",
            "value": 100,
            "unit": "cm",
            "measured_at": "2024-01-01",
        },
    )

    # Familia B: no ve nada
    _as(identity, "org_metrics_iso_b", "user_metrics_iso_b")
    resp = await auth_client.get("/children", params={"include": "current_metrics"})
    assert resp.status_code == 200
    assert resp.json() == []
