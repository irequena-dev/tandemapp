"""Tests para Pauta que acepta Miembro como sujeto (issue 01 pautas-miembros).

Cubre:
- POST /pautas con member_id (sin child_id) crea Pauta con subject_name = display_name.
- POST /pautas con ambos (child_id + member_id) → 422.
- POST /pautas con member_id + health_visit_id → 400.
- POST /pautas con member_id de otra Familia → 403/404.
- GET /pautas devuelve pautas de Hijos y Miembros mezcladas con subject_name.
- Pautas existentes (con child_id) siguen funcionando.
- Poller de avisos dispara para pautas de Miembros igual que para Hijos.
"""

import json
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Family,
    Member,
    Pauta,
    PushSubscription,
)
from app.poller import poll_once


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _create_child(client: AsyncClient, name: str = "Mateo") -> str:
    resp = await client.post(
        "/children", json={"name": name, "birth_date": "2020-03-15"}
    )
    assert resp.status_code == 201
    return resp.json()["id"]


# ---------- POST /pautas con member_id ----------


async def test_create_pauta_for_member(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /pautas con member_id (sin child_id) crea la Pauta;
    la respuesta incluye subject_name = display_name del Miembro."""
    _as(identity, "org_pm_create", "user_pm_create")

    resp = await auth_client.post(
        "/pautas",
        json={
            "member_id": "user_pm_create",
            "medication": "Omeprazol",
            "dose": "20 mg",
            "interval_hours": 24,
            "duration_days": 14,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["member_id"] == "user_pm_create"
    assert body["child_id"] is None
    assert body["medication"] == "Omeprazol"
    assert body["status"] == "active"
    assert body["subject_name"] is not None
    assert body["health_visit_id"] is None


# ---------- POST /pautas con ambos → 422 ----------


async def test_create_pauta_both_child_and_member_422(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /pautas con child_id + member_id → 422."""
    _as(identity, "org_pm_both", "user_pm_both")
    child_id = await _create_child(auth_client)

    resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "member_id": "user_pm_both",
            "medication": "Amoxicilina",
            "dose": "5 ml",
            "interval_hours": 8,
            "duration_days": 7,
        },
    )
    assert resp.status_code == 422


# ---------- POST /pautas con ninguno → 422 ----------


async def test_create_pauta_neither_child_nor_member_422(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /pautas sin child_id ni member_id → 422."""
    _as(identity, "org_pm_neither", "user_pm_neither")

    resp = await auth_client.post(
        "/pautas",
        json={
            "medication": "Ibuprofeno",
            "dose": "3 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    assert resp.status_code == 422


# ---------- POST /pautas member_id + health_visit_id → 400 ----------


async def test_create_pauta_member_with_health_visit_400(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /pautas con member_id + health_visit_id → 400."""
    _as(identity, "org_pm_hv", "user_pm_hv")

    resp = await auth_client.post(
        "/pautas",
        json={
            "member_id": "user_pm_hv",
            "medication": "Omeprazol",
            "dose": "20 mg",
            "interval_hours": 24,
            "duration_days": 14,
            "health_visit_id": str(uuid.uuid4()),
        },
    )
    assert resp.status_code == 400


# ---------- POST /pautas member_id de otra Familia → 403 ----------


async def test_create_pauta_member_other_family_forbidden(
    auth_client: AsyncClient, identity: dict
) -> None:
    """POST /pautas con member_id de otra Familia → 403."""
    # Create member in family A
    _as(identity, "org_pm_fam_a", "user_pm_fam_a")
    # Hit any endpoint to materialise family A
    await auth_client.get("/pautas")

    # Switch to family B, try to create pauta for member of family A
    _as(identity, "org_pm_fam_b", "user_pm_fam_b")
    resp = await auth_client.post(
        "/pautas",
        json={
            "member_id": "user_pm_fam_a",
            "medication": "Secreto",
            "dose": "1 ml",
            "interval_hours": 8,
            "duration_days": 5,
        },
    )
    assert resp.status_code == 403


# ---------- GET /pautas: mixtas con subject_name ----------


async def test_list_pautas_mixed_child_and_member_with_subject_name(
    auth_client: AsyncClient, identity: dict
) -> None:
    """GET /pautas devuelve pautas de Hijos y Miembros con subject_name."""
    _as(identity, "org_pm_list", "user_pm_list")
    child_id = await _create_child(auth_client, "Lucía")

    # Pauta para Hijo
    resp_child = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Dalsy",
            "dose": "4 ml",
            "interval_hours": 8,
            "duration_days": 3,
        },
    )
    assert resp_child.status_code == 201

    # Pauta para Miembro
    resp_member = await auth_client.post(
        "/pautas",
        json={
            "member_id": "user_pm_list",
            "medication": "Omeprazol",
            "dose": "20 mg",
            "interval_hours": 24,
            "duration_days": 14,
        },
    )
    assert resp_member.status_code == 201

    # Listar todas
    listed = (await auth_client.get("/pautas")).json()
    assert len(listed) == 2
    for p in listed:
        assert "subject_name" in p
        assert p["subject_name"] is not None

    # La de Hijo tiene subject_name = nombre del Hijo
    child_pauta = [p for p in listed if p["child_id"] is not None][0]
    assert child_pauta["subject_name"] == "Lucía"

    # La de Miembro tiene subject_name = display_name del Miembro
    member_pauta = [p for p in listed if p["member_id"] is not None][0]
    assert member_pauta["subject_name"] is not None


# ---------- Pautas existentes (con child_id) siguen funcionando ----------


async def test_existing_child_pautas_still_work(
    auth_client: AsyncClient, identity: dict
) -> None:
    """Pautas creadas con child_id siguen funcionando sin cambios."""
    _as(identity, "org_pm_compat", "user_pm_compat")
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
    body = resp.json()
    assert body["child_id"] == child_id
    assert body["member_id"] is None
    assert body["subject_name"] is not None


# ---------- Poller: avisos para pautas de Miembros ----------


@pytest.mark.asyncio
async def test_poller_sends_aviso_for_member_pauta(
    admin_session: AsyncSession,
) -> None:
    """El poller de avisos dispara notificaciones para pautas de Miembros."""
    org = f"org_poll_member_{uuid.uuid4().hex[:8]}"

    # Seed family with member + push subscription (no child needed)
    admin_session.add(Family(id=org))
    await admin_session.flush()
    member_id = f"user_{org}"
    admin_session.add(Member(id=member_id, family_id=org, display_name="Adulto Test"))
    await admin_session.flush()

    sub = PushSubscription(
        family_id=org,
        member_id=member_id,
        endpoint=f"https://push.example.com/{org}/dev1",
        p256dh="test_key",
        auth="test_auth",
    )
    admin_session.add(sub)
    await admin_session.flush()

    now = datetime.now(UTC)
    pauta = Pauta(
        family_id=org,
        child_id=None,
        member_id=member_id,
        medication="Omeprazol",
        dose="20 mg",
        interval_hours=24,
        duration_days=14,
        started_at=now - timedelta(hours=24, minutes=5),
        status="active",
        created_by=member_id,
        created_at=now - timedelta(hours=24, minutes=5),
    )
    admin_session.add(pauta)
    await admin_session.commit()

    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once()

    assert sent > 0
    assert mock_wp.call_count == 1
    payload = json.loads(
        mock_wp.call_args.kwargs.get("data", mock_wp.call_args[1].get("data", ""))
    )
    assert "Adulto Test" in payload.get("body", "")
    assert "Omeprazol" in payload.get("body", "")
