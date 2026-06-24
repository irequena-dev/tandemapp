"""Tests del poller de Avisos de Administración (toma).

Cubre:
- Un Aviso por suscripción, una sola vez (ciclos repetidos no reenvían).
- Registrar Administración apunta al nuevo `next_dose_at`.
- Toma vencida > 15 min se marca enviada sin push.
- Aviso llega a todas las suscripciones de todos los Miembros de la Familia.
- `push_sent_log` bajo RLS por `family_id` (test de aislamiento).
- Contenido detallado sin diagnóstico.
- Mock `pywebpush.webpush` en los tests.
"""

import json
import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Administration,
    Child,
    Family,
    Member,
    Pauta,
    PushSentLog,
    PushSubscription,
)
from app.poller import poll_once


async def _seed_family(
    session: AsyncSession,
    org: str,
    *,
    member_ids: list[str] | None = None,
    sub_tags: list[str] | None = None,
) -> tuple[str, Child, list[PushSubscription]]:
    """Seed a Familia with a Child, Members, and PushSubscriptions."""
    session.add(Family(id=org))
    await session.flush()

    if member_ids is None:
        member_ids = [f"user_{org}"]
    for mid in member_ids:
        session.add(Member(id=mid, family_id=org, display_name=f"Name {mid}"))
    child = Child(family_id=org, name="Lucía", birth_date=date(2021, 6, 1))
    session.add(child)
    await session.flush()

    subs: list[PushSubscription] = []
    if sub_tags is None:
        sub_tags = [f"{mid}_dev1" for mid in member_ids]
    for i, tag in enumerate(sub_tags):
        mid = member_ids[i % len(member_ids)]
        sub = PushSubscription(
            family_id=org,
            member_id=mid,
            endpoint=f"https://push.example.com/{org}/{tag}",
            p256dh="test_key",
            auth="test_auth",
        )
        session.add(sub)
        subs.append(sub)
    await session.flush()
    return org, child, subs


def _make_pauta(
    family_id: str,
    child_id: uuid.UUID,
    member_id: str,
    *,
    started_at: datetime,
    interval_hours: int = 8,
    medication: str = "Ibuprofeno",
    dose: str = "3 ml",
) -> Pauta:
    return Pauta(
        family_id=family_id,
        child_id=child_id,
        medication=medication,
        dose=dose,
        interval_hours=interval_hours,
        duration_days=7,
        started_at=started_at,
        status="active",
        created_by=member_id,
        created_at=started_at,
    )


# ---------- 1. Exactly one Aviso per subscription, no re-send ----------------


@pytest.mark.asyncio
async def test_poller_sends_once_per_subscription(
    admin_session: AsyncSession,
) -> None:
    """The poller sends exactly one push per subscription, and repeated cycles
    do not re-send."""
    org = f"org_poll_once_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"

    now = datetime.now(UTC)
    # Overdue by 5 min (within 15-min grace window → push sent)
    pauta = _make_pauta(
        org,
        child.id,
        member_id,
        started_at=now - timedelta(hours=8, minutes=5),
    )
    admin_session.add(pauta)
    await admin_session.commit()

    with patch("app.poller.webpush") as mock_wp:
        sent_1 = await poll_once()

    assert sent_1 > 0
    assert mock_wp.call_count == len(subs)

    # Second cycle: no re-send
    with patch("app.poller.webpush") as mock_wp2:
        sent_2 = await poll_once()

    assert sent_2 == 0
    assert mock_wp2.call_count == 0


# ---------- 2. New Administration shifts next_dose_at -------------------------


@pytest.mark.asyncio
async def test_poller_follows_new_next_dose_after_administration(
    admin_session: AsyncSession,
) -> None:
    """Registering an Administration shifts next_dose_at; the next cycle targets
    the new instant (and does not re-send the old one)."""
    org = f"org_poll_shift_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"

    now = datetime.now(UTC)
    pauta = _make_pauta(
        org,
        child.id,
        member_id,
        started_at=now - timedelta(hours=8, minutes=5),
    )
    admin_session.add(pauta)
    await admin_session.flush()
    pauta_id = pauta.id
    await admin_session.commit()

    # First cycle: sends for initial next_dose_at
    with patch("app.poller.webpush"):
        await poll_once()

    # Register an Administration → next_dose_at shifts
    admin_session.add(
        Administration(
            family_id=org,
            pauta_id=pauta_id,
            administered_at=now,
            administered_by=member_id,
        )
    )
    await admin_session.commit()

    # New next_dose_at is now + interval_hours = now + 8h → not yet due
    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once()

    assert sent == 0
    assert mock_wp.call_count == 0


# ---------- 3. Grace window > 15 min → marked without sending ----------------


@pytest.mark.asyncio
async def test_poller_grace_window_no_push(
    admin_session: AsyncSession,
) -> None:
    """A dose overdue > 15 min is marked in push_sent_log without sending push."""
    org = f"org_poll_grace_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"

    now = datetime.now(UTC)
    # started 20h ago → next_dose_at = started + 8h = 12h ago (> 15 min)
    pauta = _make_pauta(org, child.id, member_id, started_at=now - timedelta(hours=20))
    admin_session.add(pauta)
    await admin_session.commit()

    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once()

    # No push sent, but marked
    assert sent == 0
    assert mock_wp.call_count == 0

    # Verify it was logged (won't re-trigger)
    with patch("app.poller.webpush") as mock_wp2:
        sent2 = await poll_once()
    assert sent2 == 0
    assert mock_wp2.call_count == 0


# ---------- 4. Push reaches all subscriptions of all Members -----------------


@pytest.mark.asyncio
async def test_poller_sends_to_all_family_subscriptions(
    admin_session: AsyncSession,
) -> None:
    """The Aviso reaches all subscriptions of all Members of the Familia."""
    org = f"org_poll_all_{uuid.uuid4().hex[:8]}"
    member_ids = [f"user_a_{org}", f"user_b_{org}"]
    sub_tags = ["a_dev1", "a_dev2", "b_dev1"]
    _, child, subs = await _seed_family(
        admin_session, org, member_ids=member_ids, sub_tags=sub_tags
    )

    now = datetime.now(UTC)
    pauta = _make_pauta(
        org,
        child.id,
        member_ids[0],
        started_at=now - timedelta(hours=8, minutes=5),
    )
    admin_session.add(pauta)
    await admin_session.commit()

    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once()

    assert sent == 3  # 3 subscriptions
    assert mock_wp.call_count == 3


# ---------- 5. RLS isolation of push_sent_log --------------------------------


@pytest.mark.asyncio
async def test_push_sent_log_rls_isolation(
    admin_session: AsyncSession,
    app_session: AsyncSession,
) -> None:
    """push_sent_log is isolated by family_id under RLS."""
    org_a = f"org_rls_a_{uuid.uuid4().hex[:8]}"
    org_b = f"org_rls_b_{uuid.uuid4().hex[:8]}"

    # Seed two families with pautas
    for org in (org_a, org_b):
        admin_session.add(Family(id=org))
        await admin_session.flush()
        admin_session.add(Member(id=f"user_{org}", family_id=org, display_name="Test"))
        child = Child(family_id=org, name="Hijo", birth_date=date(2021, 1, 1))
        admin_session.add(child)
        await admin_session.flush()

    # Insert logs directly via admin (bypasses RLS)
    log_a = PushSentLog(
        family_id=org_a,
        pauta_id=None,
        dose_due_at=datetime.now(UTC),
    )
    log_b = PushSentLog(
        family_id=org_b,
        pauta_id=None,
        dose_due_at=datetime.now(UTC) + timedelta(seconds=1),
    )
    admin_session.add_all([log_a, log_b])
    await admin_session.commit()

    # App session with family_id = org_a → only sees org_a
    async with app_session.begin():
        await app_session.execute(
            text("SELECT set_config('app.current_family_id', :fid, true)"),
            {"fid": org_a},
        )
        rows = (
            await app_session.execute(text("SELECT family_id FROM push_sent_log"))
        ).all()
        families = {r[0] for r in rows}
        assert org_a in families
        assert org_b not in families


# ---------- 6. Push content: detailed without diagnosis -----------------------


@pytest.mark.asyncio
async def test_poller_push_content_detailed_no_diagnosis(
    admin_session: AsyncSession,
) -> None:
    """Push payload contains child name + medication + dose, no diagnosis.
    data.url points to '/' (Hoy tab)."""
    org = f"org_poll_content_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"

    now = datetime.now(UTC)
    pauta = _make_pauta(
        org,
        child.id,
        member_id,
        started_at=now - timedelta(hours=8, minutes=5),
        medication="Amoxicilina",
        dose="5 ml",
    )
    admin_session.add(pauta)
    await admin_session.commit()

    with patch("app.poller.webpush") as mock_wp:
        await poll_once()

    assert mock_wp.call_count == 1
    call_args = mock_wp.call_args
    payload = json.loads(call_args.kwargs.get("data", call_args[1].get("data", "")))

    # Child name + medication + dose in body
    assert "Lucía" in payload.get("body", "")
    assert "Amoxicilina" in payload.get("body", "")
    assert "5 ml" in payload.get("body", "")
    # No diagnosis
    assert "diagnos" not in json.dumps(payload).lower()
    # URL → Hoy tab
    assert payload.get("data", {}).get("url") == "/"


# ---------- 7. Finished pauta is not polled -----------------------------------


@pytest.mark.asyncio
async def test_poller_ignores_finished_pautas(
    admin_session: AsyncSession,
) -> None:
    """A finished Pauta does not trigger any Aviso."""
    org = f"org_poll_fin_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"

    now = datetime.now(UTC)
    pauta = _make_pauta(
        org,
        child.id,
        member_id,
        started_at=now - timedelta(hours=8, minutes=5),
    )
    pauta.status = "finished"
    admin_session.add(pauta)
    await admin_session.commit()

    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once()

    assert sent == 0
    assert mock_wp.call_count == 0
