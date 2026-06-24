"""Tests del poller de Avisos de Evento.

Cubre:
1. Evento con hora → dos Avisos (60 min y 24 h antes), cada uno una sola vez.
2. Evento de todo el día → dos Avisos (8:00 del día y 8:00 del día anterior),
   resueltos en Europe/Madrid.
3. Cruce DST de Europe/Madrid.
4. Editar fecha/hora → nueva clave; el aviso viejo no se reenvía.
5. Aviso vencido > 15 min → marcado sin push; Eventos ya pasados no avisan.
6. Aviso llega a todas las suscripciones de la Familia; data.url → /eventos.
7. RLS isolation test para push_sent_log con event entries.
8. Mock pywebpush.webpush en los tests (no enviar push real).
"""

import json
import uuid
from datetime import UTC, date, datetime, time, timedelta
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Child,
    Event,
    EventType,
    Family,
    Member,
    PushSentLog,
    PushSubscription,
)
from app.poller import poll_once

MADRID = ZoneInfo("Europe/Madrid")


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


def _seed_event_type(session: AsyncSession, family_id: str) -> EventType:
    et = EventType(family_id=family_id, name="médico", icon="heart")
    session.add(et)
    return et


def _make_event(
    family_id: str,
    child: Child,
    event_type: EventType,
    member_id: str,
    *,
    ev_date: date,
    ev_time: time | None = None,
    title: str = "Pediatra",
    status: str = "pending",
) -> Event:
    return Event(
        family_id=family_id,
        title=title,
        date=ev_date,
        time=ev_time,
        event_type_id=event_type.id,
        child_id=child.id,
        status=status,
        created_by=member_id,
    )


# ---------- 1. Evento con hora → 2 Avisos (60m y 24h antes) ------------------


@pytest.mark.asyncio
async def test_event_with_time_generates_two_alerts(
    admin_session: AsyncSession,
) -> None:
    """An Event with time generates lead_60m and lead_24h alerts, each once."""
    org = f"org_ev_time_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    # Event at a specific future date/time in Madrid
    ev_date = date(2026, 9, 15)
    ev = _make_event(
        org,
        child,
        et,
        member_id,
        ev_date=ev_date,
        ev_time=time(15, 0),
    )
    admin_session.add(ev)
    await admin_session.commit()

    event_instant = datetime.combine(ev_date, time(15, 0), tzinfo=MADRID)

    # Freeze "now" to 24h before the event → lead_24h fires
    now_24h = event_instant - timedelta(hours=24)
    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once(now=now_24h)

    assert sent == len(subs), f"Expected {len(subs)} pushes (lead_24h), got {sent}"
    assert mock_wp.call_count == len(subs)

    # Second cycle at same time → no re-send
    with patch("app.poller.webpush") as mock_wp2:
        sent2 = await poll_once(now=now_24h)

    assert sent2 == 0
    assert mock_wp2.call_count == 0

    # Freeze "now" to 60 min before the event → lead_60m fires
    now_60m = event_instant - timedelta(minutes=60)
    with patch("app.poller.webpush"):
        sent3 = await poll_once(now=now_60m)

    assert sent3 == len(subs), f"Expected {len(subs)} pushes (lead_60m), got {sent3}"


# ---------- 2. Evento de todo el día → 2 Avisos (8:00 día y 8:00 anterior) ---


@pytest.mark.asyncio
async def test_allday_event_generates_morning_alerts(
    admin_session: AsyncSession,
) -> None:
    """An all-day Event generates morning_of (8:00 on the day) and
    morning_before (8:00 the day before), resolved in Europe/Madrid."""
    org = f"org_ev_allday_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    ev_date = date(2026, 9, 20)
    ev = _make_event(
        org,
        child,
        et,
        member_id,
        ev_date=ev_date,
        ev_time=None,
        title="Vacunación",
    )
    admin_session.add(ev)
    await admin_session.commit()

    morning_before = datetime.combine(
        ev_date - timedelta(days=1),
        time(8, 0),
        tzinfo=MADRID,
    )
    morning_of = datetime.combine(ev_date, time(8, 0), tzinfo=MADRID)

    # Freeze at morning_before → morning_before fires
    with patch("app.poller.webpush"):
        sent = await poll_once(now=morning_before)

    assert sent == len(subs)

    # Freeze at morning_of → morning_of fires
    with patch("app.poller.webpush"):
        sent2 = await poll_once(now=morning_of)

    assert sent2 == len(subs)


# ---------- 3. DST crossover in Europe/Madrid --------------------------------


@pytest.mark.asyncio
async def test_dst_crossover_europe_madrid(
    admin_session: AsyncSession,
) -> None:
    """Event instant is resolved correctly across DST boundaries.
    2026-03-29 is the spring-forward day in Europe/Madrid (CET→CEST)."""
    org = f"org_ev_dst_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    # Event on 2026-03-29 at 10:00 (after spring-forward, CEST = UTC+2)
    dst_date = date(2026, 3, 29)
    ev = _make_event(
        org,
        child,
        et,
        member_id,
        ev_date=dst_date,
        ev_time=time(10, 0),
    )
    admin_session.add(ev)
    await admin_session.commit()

    event_instant = datetime.combine(dst_date, time(10, 0), tzinfo=MADRID)
    # After spring-forward: 10:00 CEST = 08:00 UTC
    assert event_instant.utcoffset().total_seconds() == 7200  # UTC+2

    # 24h before in UTC — crosses the DST boundary (day before is CET = UTC+1)
    now_24h = event_instant - timedelta(hours=24)
    # 24h before 08:00 UTC = 2026-03-28 08:00 UTC = 09:00 CET (UTC+1)
    with patch("app.poller.webpush"):
        sent = await poll_once(now=now_24h)

    assert sent == len(subs)

    # 60 min before = 09:00 CEST = 07:00 UTC
    now_60m = event_instant - timedelta(minutes=60)
    with patch("app.poller.webpush"):
        sent2 = await poll_once(now=now_60m)

    assert sent2 == len(subs)


# ---------- 4. Edit date/time → new key; old alert not re-sent ----------------


@pytest.mark.asyncio
async def test_edit_event_reschedules_alert(
    admin_session: AsyncSession,
) -> None:
    """Editing an Event's date/time changes the key; the old alert is not
    re-sent and the new alert fires at the new time."""
    org = f"org_ev_edit_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    ev_date = date(2026, 9, 25)
    ev = _make_event(
        org,
        child,
        et,
        member_id,
        ev_date=ev_date,
        ev_time=time(14, 0),
    )
    admin_session.add(ev)
    await admin_session.commit()

    original_instant = datetime.combine(ev_date, time(14, 0), tzinfo=MADRID)
    now_60m_orig = original_instant - timedelta(minutes=60)

    # Fire lead_60m for original time
    with patch("app.poller.webpush"):
        sent = await poll_once(now=now_60m_orig)
    assert sent == len(subs)

    # Edit the event to 16:00
    ev.time = time(16, 0)
    admin_session.add(ev)
    await admin_session.commit()

    new_instant = datetime.combine(ev_date, time(16, 0), tzinfo=MADRID)
    now_60m_new = new_instant - timedelta(minutes=60)

    # Cycle at old 60m → nothing (already sent for old key, new key not due)
    with patch("app.poller.webpush"):
        sent2 = await poll_once(now=now_60m_orig)
    assert sent2 == 0

    # Cycle at new 60m → fires for the new instant
    with patch("app.poller.webpush"):
        sent3 = await poll_once(now=now_60m_new)
    assert sent3 == len(subs)


# ---------- 5. Overdue > 15 min → marked without push; past events skip ------


@pytest.mark.asyncio
async def test_overdue_alert_marked_without_push(
    admin_session: AsyncSession,
) -> None:
    """An alert overdue > 15 min is marked sent without sending push."""
    org = f"org_ev_grace_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    ev_date = date(2026, 9, 22)
    ev = _make_event(
        org,
        child,
        et,
        member_id,
        ev_date=ev_date,
        ev_time=time(10, 0),
    )
    admin_session.add(ev)
    await admin_session.commit()

    event_instant = datetime.combine(ev_date, time(10, 0), tzinfo=MADRID)
    alert_time_60m = event_instant - timedelta(minutes=60)
    # "now" = 20 min after the alert was due
    now_late = alert_time_60m + timedelta(minutes=20)

    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once(now=now_late)

    assert sent == 0
    assert mock_wp.call_count == 0

    # Verify it was logged (won't re-trigger next cycle)
    with patch("app.poller.webpush"):
        sent2 = await poll_once(now=now_late)
    assert sent2 == 0


@pytest.mark.asyncio
async def test_past_events_never_alerted(
    admin_session: AsyncSession,
) -> None:
    """Events whose instant is in the past are never alerted."""
    org = f"org_ev_past_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    # Event yesterday at 10:00
    yesterday = date(2025, 1, 10)
    ev = _make_event(
        org,
        child,
        et,
        member_id,
        ev_date=yesterday,
        ev_time=time(10, 0),
    )
    admin_session.add(ev)
    await admin_session.commit()

    # "now" is well after the event
    now = datetime(2025, 1, 11, 12, 0, tzinfo=UTC)
    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once(now=now)

    assert sent == 0
    assert mock_wp.call_count == 0


# ---------- 6. All subscriptions + data.url → /eventos -----------------------


@pytest.mark.asyncio
async def test_event_alert_reaches_all_subs_url_eventos(
    admin_session: AsyncSession,
) -> None:
    """The Aviso reaches all subscriptions; data.url points to /eventos.
    Payload includes event title + time + child name."""
    org = f"org_ev_all_{uuid.uuid4().hex[:8]}"
    member_ids = [f"user_a_{org}", f"user_b_{org}"]
    sub_tags = ["a_dev1", "a_dev2", "b_dev1"]
    _, child, subs = await _seed_family(
        admin_session,
        org,
        member_ids=member_ids,
        sub_tags=sub_tags,
    )
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    ev_date = date(2026, 10, 5)
    ev = _make_event(
        org,
        child,
        et,
        member_ids[0],
        ev_date=ev_date,
        ev_time=time(16, 30),
        title="Revisión ocular",
    )
    admin_session.add(ev)
    await admin_session.commit()

    event_instant = datetime.combine(ev_date, time(16, 30), tzinfo=MADRID)
    now_60m = event_instant - timedelta(minutes=60)

    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once(now=now_60m)

    assert sent == 3
    assert mock_wp.call_count == 3

    # Check payload
    call_args = mock_wp.call_args
    payload = json.loads(call_args.kwargs.get("data", call_args[1].get("data", "")))
    assert payload.get("data", {}).get("url") == "/eventos"
    body_title = payload.get("title", "") + " " + payload.get("body", "")
    assert "Revisión ocular" in body_title
    assert "16:30" in body_title
    assert "Lucía" in body_title


# ---------- 7. RLS isolation for push_sent_log (event entries) ----------------


@pytest.mark.asyncio
async def test_push_sent_log_event_rls_isolation(
    admin_session: AsyncSession,
    app_session: AsyncSession,
) -> None:
    """push_sent_log event entries are isolated by family_id under RLS."""
    org_a = f"org_ev_rls_a_{uuid.uuid4().hex[:8]}"
    org_b = f"org_ev_rls_b_{uuid.uuid4().hex[:8]}"

    for org in (org_a, org_b):
        admin_session.add(Family(id=org))
        await admin_session.flush()
        admin_session.add(Member(id=f"user_{org}", family_id=org, display_name="Test"))
        child = Child(family_id=org, name="Hijo", birth_date=date(2021, 1, 1))
        admin_session.add(child)
        await admin_session.flush()

    now = datetime.now(UTC)

    # Create real EventTypes and Events so FK is satisfied
    et_a = EventType(family_id=org_a, name="médico", icon="heart")
    et_b = EventType(family_id=org_b, name="médico", icon="heart")
    admin_session.add_all([et_a, et_b])
    await admin_session.flush()

    ev_a = Event(
        family_id=org_a,
        title="Ev A",
        date=date(2026, 9, 15),
        event_type_id=et_a.id,
        created_by=f"user_{org_a}",
    )
    ev_b = Event(
        family_id=org_b,
        title="Ev B",
        date=date(2026, 9, 15),
        event_type_id=et_b.id,
        created_by=f"user_{org_b}",
    )
    admin_session.add_all([ev_a, ev_b])
    await admin_session.flush()

    log_a = PushSentLog(
        family_id=org_a,
        event_id=ev_a.id,
        event_instant=now,
        alert_type="lead_60m",
    )
    log_b = PushSentLog(
        family_id=org_b,
        event_id=ev_b.id,
        event_instant=now + timedelta(seconds=1),
        alert_type="lead_60m",
    )
    admin_session.add_all([log_a, log_b])
    await admin_session.commit()

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


# ---------- 8. Done events are not alerted ------------------------------------


@pytest.mark.asyncio
async def test_done_events_not_alerted(
    admin_session: AsyncSession,
) -> None:
    """Events with status 'done' are not processed by the poller."""
    org = f"org_ev_done_{uuid.uuid4().hex[:8]}"
    _, child, subs = await _seed_family(admin_session, org)
    member_id = f"user_{org}"
    et = _seed_event_type(admin_session, org)
    await admin_session.flush()

    ev_date = date(2026, 9, 28)
    ev = _make_event(
        org,
        child,
        et,
        member_id,
        ev_date=ev_date,
        ev_time=time(15, 0),
        status="done",
    )
    admin_session.add(ev)
    await admin_session.commit()

    event_instant = datetime.combine(ev_date, time(15, 0), tzinfo=MADRID)
    now_60m = event_instant - timedelta(minutes=60)

    with patch("app.poller.webpush") as mock_wp:
        sent = await poll_once(now=now_60m)

    assert sent == 0
    assert mock_wp.call_count == 0
