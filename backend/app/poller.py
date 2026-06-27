"""Poller de Avisos (Administración + Evento): proceso único dedicado.

Cada ~1 min relee el estado real de las Pautas activas y los Eventos
pendientes y envía push a todos los Miembros de la Familia.

- Administración: `next_dose_at <= now`. Anti-duplicado `(pauta_id, dose_due_at)`.
- Evento con hora: avisos a 60 min y 24 h antes del instante.
- Evento de todo el día: avisos a las 8:00 del día y 8:00 del día anterior.
- Anti-duplicado Evento: `(event_id, event_instant, alert_type)`.
- Ventana de gracia 15 min. Eventos ya pasados nunca se avisan.

Punto de entrada: `python -m app.poller`.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from .config import Settings, get_settings
from .models import (
    Administration,
    Child,
    Event,
    Member,
    Pauta,
    PushSentLog,
    PushSubscription,
)
from .tenancy import open_family_scope

logger = logging.getLogger(__name__)

GRACE_MINUTES = 15
POLL_INTERVAL_SECONDS = 60


def _next_dose_at(pauta: Pauta, admins: list[Administration]) -> datetime:
    """Calcula next_dose_at reutilizando la misma lógica de pautas_service."""
    base = admins[-1].administered_at if admins else pauta.started_at
    return base + timedelta(hours=pauta.interval_hours)


async def poll_once(*, now: datetime | None = None) -> int:
    """Ejecuta un ciclo del poller. Devuelve el nº de pushes enviados.

    *now* puede inyectarse para tests; por defecto es `datetime.now(UTC)`.
    """
    settings = get_settings()
    if now is None:
        now = datetime.now(UTC)
    total_sent = 0

    admin_engine = create_async_engine(settings.database_url, future=True)
    try:
        async with AsyncSession(admin_engine) as admin_sess:
            # Families with active pautas
            families_with_pautas = set(
                (
                    await admin_sess.execute(
                        select(Pauta.family_id)
                        .where(Pauta.status == "active")
                        .distinct()
                    )
                )
                .scalars()
                .all()
            )

            # Families with pending events
            families_with_events = set(
                (
                    await admin_sess.execute(
                        select(Event.family_id)
                        .where(Event.status == "pending")
                        .distinct()
                    )
                )
                .scalars()
                .all()
            )
    finally:
        await admin_engine.dispose()

    all_families = families_with_pautas | families_with_events

    for family_id in all_families:
        if family_id in families_with_pautas:
            sent = await _process_family(family_id, now, settings)
            total_sent += sent
        if family_id in families_with_events:
            sent = await _process_family_events(family_id, now, settings)
            total_sent += sent

    return total_sent


async def _process_family(family_id: str, now: datetime, settings: object) -> int:
    """Procesa una Familia: envía Avisos para Pautas vencidas."""
    sent = 0

    async with open_family_scope(family_id, "__poller__") as scope:
        session = scope.session

        # Active pautas for this family
        pautas = list(
            (
                await session.execute(
                    select(Pauta).where(
                        Pauta.status == "active",
                        Pauta.family_id == family_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        if not pautas:
            return 0

        pauta_ids = [p.id for p in pautas]

        # All administrations for these pautas (for next_dose_at calc)
        all_admins = list(
            (
                await session.execute(
                    select(Administration)
                    .where(Administration.pauta_id.in_(pauta_ids))
                    .order_by(Administration.administered_at.asc())
                )
            )
            .scalars()
            .all()
        )
        admins_by_pauta: dict = {}
        for a in all_admins:
            admins_by_pauta.setdefault(a.pauta_id, []).append(a)

        # Already sent logs for these pautas
        existing_logs = set()
        logs = (
            await session.execute(
                select(PushSentLog.pauta_id, PushSentLog.dose_due_at).where(
                    PushSentLog.pauta_id.in_(pauta_ids)
                )
            )
        ).all()
        for log_pauta_id, log_dose_due_at in logs:
            existing_logs.add((log_pauta_id, log_dose_due_at))

        # Subject names for payload (children or members)
        child_ids = {p.child_id for p in pautas if p.child_id is not None}
        children = {}
        if child_ids:
            rows = (
                (await session.execute(select(Child).where(Child.id.in_(child_ids))))
                .scalars()
                .all()
            )
            children = {c.id: c for c in rows}

        subject_member_ids = {p.member_id for p in pautas if p.member_id is not None}
        subject_members: dict[str, Member] = {}
        if subject_member_ids:
            m_rows = (
                (
                    await session.execute(
                        select(Member).where(Member.id.in_(subject_member_ids))
                    )
                )
                .scalars()
                .all()
            )
            subject_members = {m.id: m for m in m_rows}

        # Subscriptions for this family
        subscriptions = list(
            (
                await session.execute(
                    select(PushSubscription).where(
                        PushSubscription.family_id == family_id
                    )
                )
            )
            .scalars()
            .all()
        )
        if not subscriptions:
            return 0

        for pauta in pautas:
            admins = admins_by_pauta.get(pauta.id, [])
            dose_due = _next_dose_at(pauta, admins)

            if dose_due > now:
                continue  # not yet due

            # Check anti-duplicate
            key = (pauta.id, dose_due)
            if key in existing_logs:
                continue

            if pauta.child_id is not None:
                child = children.get(pauta.child_id)
                subject_name = child.name if child else "Hijo"
            else:
                member = subject_members.get(pauta.member_id)  # type: ignore[arg-type]
                subject_name = (
                    member.display_name if member and member.display_name else "Miembro"
                )

            overdue = now - dose_due
            if overdue > timedelta(minutes=GRACE_MINUTES):
                # Mark as sent without pushing
                session.add(
                    PushSentLog(
                        family_id=family_id,
                        pauta_id=pauta.id,
                        dose_due_at=dose_due,
                    )
                )
                continue

            # Build payload
            payload = {
                "title": f"Toca toma — {subject_name}",
                "body": f"{subject_name}: {pauta.medication} {pauta.dose}",
                "data": {"url": "/"},
            }

            # Send to all subscriptions
            for sub in subscriptions:
                sub_info = {
                    "endpoint": sub.endpoint,
                    "keys": {
                        "p256dh": sub.p256dh,
                        "auth": sub.auth,
                    },
                }
                vapid_claims = {"sub": settings.vapid_subject}
                try:
                    webpush(
                        subscription_info=sub_info,
                        data=json.dumps(payload),
                        vapid_private_key=settings.vapid_private_key,
                        vapid_claims=vapid_claims,
                    )
                    sent += 1
                except WebPushException as exc:
                    resp = getattr(exc, "response", None)
                    status_code = (
                        getattr(resp, "status_code", None) if resp is not None else None
                    )
                    if status_code in (404, 410):
                        await session.delete(sub)
                        await session.flush()
                    else:
                        logger.exception("Error sending push to %s", sub.endpoint)

            # Log to prevent re-send
            session.add(
                PushSentLog(
                    family_id=family_id,
                    pauta_id=pauta.id,
                    dose_due_at=dose_due,
                )
            )

    return sent


# ---------------------------------------------------------------------------
#  Eventos
# ---------------------------------------------------------------------------

_MORNING_HOUR = time(8, 0)


def _event_alerts(
    event: Event,
    tz: ZoneInfo,
) -> list[tuple[datetime, str]]:
    """Calcula los instantes de alerta para un Evento.

    Devuelve pares `(alert_instant_utc, alert_type)`.  El instante se
    devuelve en UTC para poder compararlo directamente con *now*.
    """
    alerts: list[tuple[datetime, str]] = []

    if event.time is not None:
        # Evento con hora → instante absoluto
        event_instant = datetime.combine(event.date, event.time, tzinfo=tz)
        alerts.append((event_instant - timedelta(minutes=60), "lead_60m"))
        alerts.append((event_instant - timedelta(hours=24), "lead_24h"))
    else:
        # Evento de todo el día → 8:00 del día y 8:00 del día anterior
        morning_of = datetime.combine(event.date, _MORNING_HOUR, tzinfo=tz)
        morning_before = datetime.combine(
            event.date - timedelta(days=1),
            _MORNING_HOUR,
            tzinfo=tz,
        )
        alerts.append((morning_of, "morning_of"))
        alerts.append((morning_before, "morning_before"))

    return alerts


def _event_instant(event: Event, tz: ZoneInfo) -> datetime:
    """Instante absoluto del Evento (para comprobar si ya pasó)."""
    if event.time is not None:
        return datetime.combine(event.date, event.time, tzinfo=tz)
    # Todo el día → fin lógico = 23:59:59 del día
    return datetime.combine(event.date, time(23, 59, 59), tzinfo=tz)


async def _process_family_events(
    family_id: str,
    now: datetime,
    settings: Settings,
) -> int:
    """Procesa Eventos pendientes de una Familia."""
    sent = 0
    tz = ZoneInfo(settings.timezone)

    async with open_family_scope(family_id, "__poller__") as scope:
        session = scope.session

        # Pending events for this family
        events = list(
            (
                await session.execute(
                    select(Event).where(
                        Event.status == "pending",
                        Event.family_id == family_id,
                    )
                )
            )
            .scalars()
            .all()
        )
        if not events:
            return 0

        event_ids = [e.id for e in events]

        # Existing event logs for anti-duplicate
        existing_event_logs: set[tuple] = set()
        rows = (
            await session.execute(
                select(
                    PushSentLog.event_id,
                    PushSentLog.event_instant,
                    PushSentLog.alert_type,
                ).where(
                    PushSentLog.event_id.in_(event_ids),
                )
            )
        ).all()
        for eid, einstant, atype in rows:
            existing_event_logs.add((eid, einstant, atype))

        # Children names for payload
        child_ids = {e.child_id for e in events if e.child_id is not None}
        children: dict = {}
        if child_ids:
            child_rows = (
                (await session.execute(select(Child).where(Child.id.in_(child_ids))))
                .scalars()
                .all()
            )
            children = {c.id: c for c in child_rows}

        # Subscriptions for this family
        subscriptions = list(
            (
                await session.execute(
                    select(PushSubscription).where(
                        PushSubscription.family_id == family_id
                    )
                )
            )
            .scalars()
            .all()
        )
        if not subscriptions:
            return 0

        for event in events:
            ev_instant = _event_instant(event, tz)
            # Skip events already in the past
            if ev_instant <= now:
                continue

            for alert_at, alert_type in _event_alerts(event, tz):
                # alert_at is timezone-aware; compare with now (also aware)
                if alert_at > now:
                    continue  # not yet due

                # Anti-duplicate key
                key = (event.id, alert_at, alert_type)
                if key in existing_event_logs:
                    continue

                overdue = now - alert_at
                if overdue > timedelta(minutes=GRACE_MINUTES):
                    # Mark as sent without pushing
                    session.add(
                        PushSentLog(
                            family_id=family_id,
                            event_id=event.id,
                            event_instant=alert_at,
                            alert_type=alert_type,
                        )
                    )
                    existing_event_logs.add(key)
                    continue

                # Build payload
                child = children.get(event.child_id) if event.child_id else None
                child_part = f" — {child.name}" if child else ""
                if event.time is not None:
                    time_str = event.time.strftime("%H:%M")
                    body = f"{event.title} a las {time_str}{child_part}"
                else:
                    body = f"{event.title}{child_part}"

                payload = {
                    "title": f"{event.title}{child_part}",
                    "body": body,
                    "data": {"url": "/eventos"},
                }

                # Send to all subscriptions
                for sub in subscriptions:
                    sub_info = {
                        "endpoint": sub.endpoint,
                        "keys": {
                            "p256dh": sub.p256dh,
                            "auth": sub.auth,
                        },
                    }
                    vapid_claims = {"sub": settings.vapid_subject}
                    try:
                        webpush(
                            subscription_info=sub_info,
                            data=json.dumps(payload),
                            vapid_private_key=settings.vapid_private_key,
                            vapid_claims=vapid_claims,
                        )
                        sent += 1
                    except WebPushException as exc:
                        resp = getattr(exc, "response", None)
                        status_code = (
                            getattr(resp, "status_code", None)
                            if resp is not None
                            else None
                        )
                        if status_code in (404, 410):
                            await session.delete(sub)
                            await session.flush()
                        else:
                            logger.exception(
                                "Error sending push to %s",
                                sub.endpoint,
                            )

                # Log to prevent re-send
                session.add(
                    PushSentLog(
                        family_id=family_id,
                        event_id=event.id,
                        event_instant=alert_at,
                        alert_type=alert_type,
                    )
                )
                existing_event_logs.add(key)

    return sent


async def run_forever() -> None:
    """Bucle principal del poller."""
    logger.info("Poller started — interval %ds", POLL_INTERVAL_SECONDS)
    while True:
        try:
            count = await poll_once()
            if count:
                logger.info("Sent %d push notification(s)", count)
        except Exception:
            logger.exception("Poller cycle failed")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_forever())
