"""Poller de Avisos de Administración (toma): proceso único dedicado.

Cada ~1 min relee el estado real de las Pautas activas y envía push a todos
los Miembros de la Familia cuando una dosis ha vencido (`next_dose_at <= now`).

Anti-duplicado por `(pauta_id, dose_due_at)` en `push_sent_log`.
Ventana de gracia: 15 min. Si la toma venció hace > 15 min, se marca enviada
sin mandar push.

Punto de entrada: `python -m app.poller`.
"""

import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta

from pywebpush import WebPushException, webpush
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from .config import get_settings
from .models import (
    Administration,
    Child,
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


async def poll_once() -> int:
    """Ejecuta un ciclo del poller. Devuelve el nº de pushes enviados."""
    settings = get_settings()
    now = datetime.now(UTC)
    total_sent = 0

    # Query families with active pautas using admin connection (bypasses RLS).
    admin_engine = create_async_engine(settings.database_url, future=True)
    try:
        async with AsyncSession(admin_engine) as admin_sess:
            families_with_pautas = (
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
    finally:
        await admin_engine.dispose()

    for family_id in families_with_pautas:
        sent = await _process_family(family_id, now, settings)
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

        # Children names for payload
        child_ids = {p.child_id for p in pautas}
        children = {}
        if child_ids:
            rows = (
                (await session.execute(select(Child).where(Child.id.in_(child_ids))))
                .scalars()
                .all()
            )
            children = {c.id: c for c in rows}

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

            child = children.get(pauta.child_id)
            child_name = child.name if child else "Hijo"

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
                "title": f"Toca toma — {child_name}",
                "body": f"{child_name}: {pauta.medication} {pauta.dose}",
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
