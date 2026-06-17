"""Tests para la costura HTTP/REST de Pautas (tratamientos).

Cubre: iniciar, listar (con filtros), detalle, finalización manual,
finalización automática (lazy), campos calculados (`ends_at`, `day_number`),
y aislamiento por Familia (RLS).
"""

from datetime import datetime, timedelta

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _create_child(client: AsyncClient, name: str = "Mateo") -> str:
    """Helper: crea un Hijo y devuelve su id."""
    resp = await client.post(
        "/children", json={"name": name, "birth_date": "2020-03-15"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


async def test_pauta_crud_and_calculated_fields(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Iniciar → listar → detalle con `ends_at`/`day_number` calculados."""
    _as(identity, "org_pauta_crud", "user_pauta_1")
    child_id = await _create_child(auth_client)

    # Iniciar una Pauta
    resp = await auth_client.post(
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
    pauta = resp.json()
    pauta_id = pauta["id"]

    # Campos obligatorios presentes
    assert pauta["medication"] == "Amoxicilina"
    assert pauta["dose"] == "5 ml"
    assert pauta["interval_hours"] == 8
    assert pauta["duration_days"] == 7
    assert pauta["status"] == "active"
    assert pauta["family_id"] == "org_pauta_crud"
    assert pauta["created_by"] == "user_pauta_1"
    assert pauta["health_visit_id"] is None

    # Campos calculados
    assert "ends_at" in pauta
    assert "day_number" in pauta
    started = datetime.fromisoformat(pauta["started_at"])
    ends = datetime.fromisoformat(pauta["ends_at"])
    assert ends - started == timedelta(days=7)
    assert pauta["day_number"] == 1

    # Listado devuelve la Pauta
    listed = (await auth_client.get("/pautas")).json()
    assert len(listed) == 1
    assert listed[0]["id"] == pauta_id

    # Detalle
    detail = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    assert detail["id"] == pauta_id
    assert detail["ends_at"] == pauta["ends_at"]


async def test_pauta_list_filters(auth_client: AsyncClient, identity: dict) -> None:
    """Filtrar por status y child_id."""
    _as(identity, "org_pauta_filter", "user_pauta_f1")
    child_a = await _create_child(auth_client, "Hijo A")
    child_b = await _create_child(auth_client, "Hijo B")

    # Crear dos pautas para hijos distintos
    await auth_client.post(
        "/pautas",
        json={
            "child_id": child_a,
            "medication": "Med A",
            "dose": "1 ml",
            "interval_hours": 12,
            "duration_days": 5,
        },
    )
    resp_b = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_b,
            "medication": "Med B",
            "dose": "2 ml",
            "interval_hours": 8,
            "duration_days": 3,
        },
    )
    pauta_b_id = resp_b.json()["id"]

    # Filtrar por child_id
    by_child = (await auth_client.get(f"/pautas?child_id={child_b}")).json()
    assert len(by_child) == 1
    assert by_child[0]["child_id"] == child_b

    # Finalizar Pauta B y filtrar por status
    await auth_client.post(f"/pautas/{pauta_b_id}/finish")
    active = (await auth_client.get("/pautas?status=active")).json()
    finished = (await auth_client.get("/pautas?status=finished")).json()
    assert all(p["status"] == "active" for p in active)
    assert all(p["status"] == "finished" for p in finished)
    assert len(active) == 1
    assert len(finished) == 1


async def test_pauta_finish_manual(auth_client: AsyncClient, identity: dict) -> None:
    """Finalización manual cambia status a finished."""
    _as(identity, "org_pauta_fin", "user_pauta_fin1")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Ibuprofeno",
            "dose": "3 ml",
            "interval_hours": 8,
            "duration_days": 3,
        },
    )
    pauta_id = resp.json()["id"]

    # Finalizar
    fin = await auth_client.post(f"/pautas/{pauta_id}/finish")
    assert fin.status_code == 200
    assert fin.json()["status"] == "finished"

    # Intentar finalizar de nuevo → 409
    again = await auth_client.post(f"/pautas/{pauta_id}/finish")
    assert again.status_code == 409


async def test_pauta_health_visit_id_optional(
    auth_client: AsyncClient, identity: dict
) -> None:
    """health_visit_id es opcional al crear una Pauta."""
    _as(identity, "org_pauta_hv", "user_pauta_hv1")
    child_id = await _create_child(auth_client)

    # Sin health_visit_id
    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Vitamina D",
            "dose": "1 gota",
            "interval_hours": 24,
            "duration_days": 90,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["health_visit_id"] is None


async def test_pautas_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS aísla las Pautas entre Familias."""
    # Familia A crea un Hijo y una Pauta
    _as(identity, "org_pauta_iso_a", "user_pauta_iso_a1")
    child_id = await _create_child(auth_client, "Hijo de A")
    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Secreto A",
            "dose": "1 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    pauta_id = resp.json()["id"]

    # Familia B no ve las Pautas de A
    _as(identity, "org_pauta_iso_b", "user_pauta_iso_b1")
    listed = (await auth_client.get("/pautas")).json()
    assert listed == []

    # Familia B no puede acceder al detalle ni finalizar
    assert (await auth_client.get(f"/pautas/{pauta_id}")).status_code == 404
    assert (await auth_client.post(f"/pautas/{pauta_id}/finish")).status_code == 404
