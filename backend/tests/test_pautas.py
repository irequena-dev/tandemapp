"""Tests para la costura HTTP/REST de Pautas (tratamientos).

Cubre: iniciar, listar (con filtros), detalle, finalización manual,
finalización automática (lazy), campos calculados (`ends_at`, `day_number`),
`next_dose_at`, y aislamiento por Familia (RLS).
"""

import os
from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine


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


async def _backdate_pauta(pauta_id: str, days_ago: int = 2) -> None:
    """Retrocede `started_at` para que la Pauta expire (owner, sin RLS)."""
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with AsyncSession(engine) as session:
        await session.execute(
            text(
                "UPDATE pautas SET started_at = now() - make_interval(days => :d) "
                "WHERE id = :id"
            ),
            {"d": days_ago, "id": pauta_id},
        )
        await session.commit()
    await engine.dispose()


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


async def test_pauta_reactivate_undoes_manual_finish(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Reactivar una Pauta finalizada manualmente la devuelve a active (deshacer)."""
    _as(identity, "org_pauta_react", "user_pauta_react1")
    child_id = await _create_child(auth_client)

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
    pauta_id = resp.json()["id"]

    # Finalizar y luego reactivar (deshacer)
    assert (await auth_client.post(f"/pautas/{pauta_id}/finish")).status_code == 200
    react = await auth_client.post(f"/pautas/{pauta_id}/reactivate")
    assert react.status_code == 200
    body = react.json()
    assert body["status"] == "active"
    # Vuelve a tener próxima toma al estar activa de nuevo
    assert body["next_dose_at"] is not None


async def test_pauta_reactivate_active_is_conflict(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Reactivar una Pauta que ya está activa → 409."""
    _as(identity, "org_pauta_react_active", "user_pauta_react2")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Ibuprofeno",
            "dose": "3 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    pauta_id = resp.json()["id"]

    assert (await auth_client.post(f"/pautas/{pauta_id}/reactivate")).status_code == 409


async def test_pauta_reactivate_expired_is_conflict(
    auth_client: AsyncClient, identity: dict
) -> None:
    """No se puede reactivar una Pauta ya caducada (lazy-finish la re-cerraría)."""
    _as(identity, "org_pauta_react_exp", "user_pauta_react3")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Jarabe",
            "dose": "5 ml",
            "interval_hours": 8,
            "duration_days": 1,
        },
    )
    pauta_id = resp.json()["id"]

    # Finalizar y caducar (started_at muy atrás → ends_at pasado)
    await auth_client.post(f"/pautas/{pauta_id}/finish")
    await _backdate_pauta(pauta_id, days_ago=3)

    assert (await auth_client.post(f"/pautas/{pauta_id}/reactivate")).status_code == 409


async def test_pauta_reactivate_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS: una Familia no puede reactivar la Pauta de otra (404)."""
    _as(identity, "org_react_iso_a", "user_react_iso_a1")
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
    await auth_client.post(f"/pautas/{pauta_id}/finish")

    _as(identity, "org_react_iso_b", "user_react_iso_b1")
    assert (await auth_client.post(f"/pautas/{pauta_id}/reactivate")).status_code == 404


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


# ---------- Finalización automática por duración ----------


async def test_pauta_auto_finish_on_get(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /pautas/:id de una Pauta expirada la marca finished (lazy)."""
    _as(identity, "org_autofinish_get", "user_af_get")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Jarabe",
            "dose": "5 ml",
            "interval_hours": 8,
            "duration_days": 1,
        },
    )
    pauta_id = resp.json()["id"]
    assert resp.json()["status"] == "active"

    # Retrotraer started_at para que ends_at ya haya pasado
    await _backdate_pauta(pauta_id, days_ago=3)

    detail = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    assert detail["status"] == "finished"


async def test_pauta_auto_finish_on_list(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /pautas lista una Pauta expirada como finished."""
    _as(identity, "org_autofinish_list", "user_af_list")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Vitaminas",
            "dose": "1 ml",
            "interval_hours": 24,
            "duration_days": 1,
        },
    )
    pauta_id = resp.json()["id"]

    await _backdate_pauta(pauta_id, days_ago=3)

    listed = (await auth_client.get("/pautas")).json()
    expired = [p for p in listed if p["id"] == pauta_id]
    assert len(expired) == 1
    assert expired[0]["status"] == "finished"


async def test_pauta_auto_finish_next_dose_null(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Pauta finalizada automáticamente devuelve next_dose_at = null."""
    _as(identity, "org_af_ndose", "user_af_ndose")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Paracetamol",
            "dose": "2.5 ml",
            "interval_hours": 6,
            "duration_days": 1,
        },
    )
    pauta_id = resp.json()["id"]

    await _backdate_pauta(pauta_id, days_ago=3)

    detail = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    assert detail["status"] == "finished"
    assert detail["next_dose_at"] is None


async def test_pauta_active_has_next_dose(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Pauta activa devuelve next_dose_at con valor (started_at + interval)."""
    _as(identity, "org_active_ndose", "user_active_ndose")
    child_id = await _create_child(auth_client)

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
    pauta = resp.json()
    assert pauta["status"] == "active"
    assert pauta["next_dose_at"] is not None
    started = datetime.fromisoformat(pauta["started_at"])
    next_dose = datetime.fromisoformat(pauta["next_dose_at"])
    assert next_dose - started == timedelta(hours=8)


async def test_pauta_manual_finish_next_dose_null(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Pauta finalizada manualmente también devuelve next_dose_at = null."""
    _as(identity, "org_mfin_ndose", "user_mfin_ndose")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Ibuprofeno",
            "dose": "3 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    pauta_id = resp.json()["id"]

    fin = await auth_client.post(f"/pautas/{pauta_id}/finish")
    assert fin.json()["status"] == "finished"
    assert fin.json()["next_dose_at"] is None


async def test_pauta_auto_finish_preserves_data(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Lazy-finish no altera los demás campos de la Pauta."""
    _as(identity, "org_af_preserve", "user_af_preserve")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Dalsy",
            "dose": "4 ml",
            "interval_hours": 6,
            "duration_days": 2,
        },
    )
    original = resp.json()
    pauta_id = original["id"]

    await _backdate_pauta(pauta_id, days_ago=5)

    detail = (await auth_client.get(f"/pautas/{pauta_id}")).json()
    assert detail["status"] == "finished"
    # Los campos de dominio no se alteran
    assert detail["medication"] == "Dalsy"
    assert detail["dose"] == "4 ml"
    assert detail["interval_hours"] == 6
    assert detail["duration_days"] == 2
    assert detail["child_id"] == child_id
    assert detail["created_by"] == "user_af_preserve"


async def test_pauta_status_filter_with_auto_finish(
    auth_client: AsyncClient, identity: dict
) -> None:
    """El filtro status funciona correctamente con auto-finish lazy.

    Una Pauta expirada (active en DB pero ends_at pasado):
    - NO aparece al filtrar `status=active`
    - SÍ aparece al filtrar `status=finished`
    """
    _as(identity, "org_af_filter", "user_af_filter")
    child_id = await _create_child(auth_client)

    # Pauta que seguirá activa
    await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Activa siempre",
            "dose": "1 ml",
            "interval_hours": 12,
            "duration_days": 30,
        },
    )

    # Pauta que expirará
    resp_exp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Expirable",
            "dose": "2 ml",
            "interval_hours": 8,
            "duration_days": 1,
        },
    )
    expired_id = resp_exp.json()["id"]
    await _backdate_pauta(expired_id, days_ago=3)

    # Filtro active: solo la que sigue activa
    active_list = (await auth_client.get("/pautas?status=active")).json()
    assert all(p["status"] == "active" for p in active_list)
    assert all(p["id"] != expired_id for p in active_list)

    # Filtro finished: incluye la expirada
    finished_list = (await auth_client.get("/pautas?status=finished")).json()
    assert any(p["id"] == expired_id for p in finished_list)
    assert all(p["status"] == "finished" for p in finished_list)


# ---------- Editar Pauta activa (PATCH) ----------


async def test_patch_pauta_partial_update(
    auth_client: AsyncClient, identity: dict
) -> None:
    """PATCH /pautas/{id} actualiza campos enviados; devuelve Pauta enriquecida."""
    _as(identity, "org_patch_ok", "user_patch_ok")
    child_id = await _create_child(auth_client)

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
    original = resp.json()
    pauta_id = original["id"]

    # Editar solo medication y dose
    patch_resp = await auth_client.patch(
        f"/pautas/{pauta_id}",
        json={"medication": "Ibuprofeno", "dose": "3 ml"},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()

    # Campos editados
    assert updated["medication"] == "Ibuprofeno"
    assert updated["dose"] == "3 ml"
    # Campos no enviados: conservan valor original
    assert updated["interval_hours"] == 8
    assert updated["duration_days"] == 7
    # started_at no se toca
    assert updated["started_at"] == original["started_at"]
    # ends_at se recalcula
    started = datetime.fromisoformat(updated["started_at"])
    ends = datetime.fromisoformat(updated["ends_at"])
    assert ends - started == timedelta(days=7)
    # Campos enriquecidos presentes
    assert "day_number" in updated
    assert "next_dose_at" in updated


async def test_patch_pauta_duration_recalculates_ends_at(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Editar duration_days recalcula ends_at desde started_at original."""
    _as(identity, "org_patch_dur", "user_patch_dur")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Dalsy",
            "dose": "4 ml",
            "interval_hours": 6,
            "duration_days": 5,
        },
    )
    original = resp.json()
    pauta_id = original["id"]

    # Cambiar duración de 5 a 10 días
    patch_resp = await auth_client.patch(
        f"/pautas/{pauta_id}",
        json={"duration_days": 10},
    )
    assert patch_resp.status_code == 200
    updated = patch_resp.json()

    assert updated["duration_days"] == 10
    started = datetime.fromisoformat(updated["started_at"])
    ends = datetime.fromisoformat(updated["ends_at"])
    assert ends - started == timedelta(days=10)
    # started_at no cambia
    assert updated["started_at"] == original["started_at"]


async def test_patch_pauta_finished_returns_409(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Intentar editar una Pauta finalizada devuelve 409."""
    _as(identity, "org_patch_409", "user_patch_409")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Vitamina D",
            "dose": "1 gota",
            "interval_hours": 24,
            "duration_days": 30,
        },
    )
    pauta_id = resp.json()["id"]

    # Finalizar
    await auth_client.post(f"/pautas/{pauta_id}/finish")

    # Intentar editar → 409
    patch_resp = await auth_client.patch(
        f"/pautas/{pauta_id}",
        json={"medication": "Otra cosa"},
    )
    assert patch_resp.status_code == 409


async def test_patch_pauta_other_family_returns_404(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS: una Familia no puede editar la Pauta de otra (404)."""
    _as(identity, "org_patch_rls_a", "user_patch_rls_a")
    child_id = await _create_child(auth_client, "Hijo RLS A")

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Secreto",
            "dose": "1 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    pauta_id = resp.json()["id"]

    # Familia B intenta editar
    _as(identity, "org_patch_rls_b", "user_patch_rls_b")
    patch_resp = await auth_client.patch(
        f"/pautas/{pauta_id}",
        json={"medication": "Hackeado"},
    )
    assert patch_resp.status_code == 404


# ---------- Eliminar Pauta activa (DELETE) ----------


async def test_delete_pauta_active_returns_204_and_cascades_admins(
    auth_client: AsyncClient, identity: dict
) -> None:
    """DELETE /pautas/{id} borra la Pauta activa y sus Administraciones; 204."""
    _as(identity, "org_del_ok", "user_del_ok")
    child_id = await _create_child(auth_client)

    # Crear Pauta
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
    pauta_id = resp.json()["id"]

    # Registrar una Administración
    admin_resp = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert admin_resp.status_code == 201

    # Eliminar la Pauta
    del_resp = await auth_client.delete(f"/pautas/{pauta_id}")
    assert del_resp.status_code == 204

    # La Pauta ya no existe
    assert (await auth_client.get(f"/pautas/{pauta_id}")).status_code == 404

    # Las Administraciones también se borraron (CASCADE)
    admins = await auth_client.get(f"/pautas/{pauta_id}/administrations")
    assert admins.status_code == 404


async def test_delete_pauta_finished_returns_409(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Intentar eliminar una Pauta finalizada devuelve 409."""
    _as(identity, "org_del_409", "user_del_409")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Vitamina D",
            "dose": "1 gota",
            "interval_hours": 24,
            "duration_days": 30,
        },
    )
    pauta_id = resp.json()["id"]

    # Finalizar
    await auth_client.post(f"/pautas/{pauta_id}/finish")

    # Intentar eliminar → 409
    del_resp = await auth_client.delete(f"/pautas/{pauta_id}")
    assert del_resp.status_code == 409


async def test_delete_pauta_other_family_returns_404(
    auth_client: AsyncClient, identity: dict
) -> None:
    """RLS: una Familia no puede eliminar la Pauta de otra (404)."""
    _as(identity, "org_del_rls_a", "user_del_rls_a")
    child_id = await _create_child(auth_client, "Hijo RLS A")

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Secreto",
            "dose": "1 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    pauta_id = resp.json()["id"]

    # Familia B intenta eliminar
    _as(identity, "org_del_rls_b", "user_del_rls_b")
    del_resp = await auth_client.delete(f"/pautas/{pauta_id}")
    assert del_resp.status_code == 404


async def test_delete_pauta_disappears_from_listing(
    auth_client: AsyncClient, identity: dict
) -> None:
    """La Pauta desaparece del listado GET /pautas tras el borrado."""
    _as(identity, "org_del_list", "user_del_list")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Ibuprofeno",
            "dose": "3 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    pauta_id = resp.json()["id"]

    # Verificar que está en el listado
    listed = (await auth_client.get("/pautas")).json()
    assert any(p["id"] == pauta_id for p in listed)

    # Eliminar
    assert (await auth_client.delete(f"/pautas/{pauta_id}")).status_code == 204

    # Ya no aparece
    listed = (await auth_client.get("/pautas")).json()
    assert all(p["id"] != pauta_id for p in listed)
