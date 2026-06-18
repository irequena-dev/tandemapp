"""GET /api/today — endpoint agregado para la pantalla Hoy.

Devuelve `TodayOut` con hero, timeline y summary acotados a la Familia del JWT.
Cada fase extiende este endpoint de forma incremental; mientras una fase no esté
conectada, su parte devuelve valores neutros (cero / null / lista vacía).

La zona horaria del **dispositivo** (query param `tz`, p. ej. `Europe/Madrid`)
define qué es "hoy"; los timestamps internos siguen en UTC.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Administration,
    Child,
    Event,
    EventOut,
    EventType,
    Member,
    Pauta,
    ShoppingItem,
)
from ..tenancy import family_session
from .events import _enrich

router = APIRouter(prefix="/api", tags=["today"])

# Ventana para considerar "inminente" la próxima toma y que ocupe el héroe.
HERO_DOSE_IMMINENT_HOURS: int = 2

# Hora de referencia para Eventos de día completo (sin `time`): medianoche.
ALL_DAY = time(0, 0)

# Nombre del tipo base del sistema que identifica una cita médica.
MEDICAL_TYPE_NAME = "Médico"


# ---------- Schemas (§6 del api-contract.md) ---------- #


class HeroItem(BaseModel):
    type: str  # "pauta_dose" | "event"
    title: str
    subtitle: str
    action_label: str
    pauta_id: str | None = None
    event_id: str | None = None


class TimelineEntry(BaseModel):
    type: str  # "dose_given" | "dose_upcoming" | "event"
    time: str  # HH:MM
    title: str
    subtitle: str | None = None
    status: str  # "done" | "upcoming" | "pending"
    pauta_id: str | None = None
    administration_id: str | None = None
    event_id: str | None = None


class TodaySummary(BaseModel):
    shopping_pending_count: int
    pautas_active_count: int
    pautas_finished_count: int
    next_medical_event: EventOut | None = None
    children_status: str  # v1: siempre "up_to_date"


class TodayOut(BaseModel):
    hero: HeroItem | None
    timeline: list[TimelineEntry]
    summary: TodaySummary


# ---------- Zona horaria del dispositivo ---------- #


def _device_tz(tz: str | None) -> ZoneInfo | type[UTC]:
    """Resuelve la zona del dispositivo; UTC si no se indica o es inválida."""
    if not tz:
        return UTC
    try:
        return ZoneInfo(tz)
    except (KeyError, ValueError):
        return UTC


# ---------- Cálculo de dosis (Fase 3) ---------- #


@dataclass
class DoseState:
    """Estado calculado de la próxima toma de una Pauta activa."""

    pauta: Pauta
    child_name: str
    next_dose_at: datetime
    # (administración, nombre del Miembro que la dio) para las dadas hoy.
    todays_admins: list[tuple[Administration, str | None]] = field(default_factory=list)


async def _compute_doses(
    session: AsyncSession,
    active_pautas: list[Pauta],
    today: date,
    device_tz: ZoneInfo | type[UTC],
) -> list[DoseState]:
    """Para cada Pauta activa calcula next_dose_at y las Administraciones de hoy.

    Carga Hijos y Administraciones en bloque (sin N+1). `next_dose_at` =
    última Administración + intervalo (o `started_at` + intervalo si ninguna).
    "Hoy" se define por la zona horaria del dispositivo.
    """
    if not active_pautas:
        return []

    child_ids = {p.child_id for p in active_pautas}
    child_names: dict[uuid.UUID, str] = {}
    if child_ids:
        children_result = await session.execute(
            select(Child).where(Child.id.in_(child_ids))
        )
        for child in children_result.scalars().all():
            child_names[child.id] = child.name

    pauta_ids = [p.id for p in active_pautas]
    admins_result = await session.execute(
        select(Administration)
        .where(Administration.pauta_id.in_(pauta_ids))
        .order_by(Administration.administered_at.asc())
    )
    all_admins = list(admins_result.scalars().all())

    member_ids = {a.administered_by for a in all_admins}
    member_names: dict[str, str | None] = {}
    if member_ids:
        members_result = await session.execute(
            select(Member).where(Member.id.in_(member_ids))
        )
        for member in members_result.scalars().all():
            member_names[member.id] = member.display_name

    by_pauta: dict[uuid.UUID, list[Administration]] = {}
    for admin in all_admins:
        by_pauta.setdefault(admin.pauta_id, []).append(admin)

    states: list[DoseState] = []
    for pauta in active_pautas:
        admins = by_pauta.get(pauta.id, [])
        last = admins[-1] if admins else None
        if last is not None:
            next_dose_at = last.administered_at + timedelta(hours=pauta.interval_hours)
        else:
            next_dose_at = pauta.started_at + timedelta(hours=pauta.interval_hours)
        todays = [
            (a, member_names.get(a.administered_by))
            for a in admins
            if a.administered_at.astimezone(device_tz).date() == today
        ]
        states.append(
            DoseState(
                pauta=pauta,
                child_name=child_names.get(pauta.child_id, "…"),
                next_dose_at=next_dose_at,
                todays_admins=todays,
            )
        )
    return states


def _dose_hero(states: list[DoseState], now: datetime) -> HeroItem | None:
    """Héroe "Ahora": la toma vencida/inminente más próxima (o None)."""
    horizon = now + timedelta(hours=HERO_DOSE_IMMINENT_HOURS)
    eligible = [s for s in states if s.next_dose_at <= horizon]
    if not eligible:
        return None
    chosen = min(eligible, key=lambda s: s.next_dose_at)
    pauta = chosen.pauta
    subtitle = f"{chosen.child_name} · Día {pauta.day_number} de {pauta.duration_days}"
    return HeroItem(
        type="pauta_dose",
        title=f"{pauta.medication} · {pauta.dose}",
        subtitle=subtitle,
        action_label="Marcar toma",
        pauta_id=str(pauta.id),
    )


def _dose_timeline_pairs(
    states: list[DoseState],
    now: datetime,
    device_tz: ZoneInfo | type[UTC],
) -> list[tuple[datetime, TimelineEntry]]:
    """Pares (instante, entrada) de tomas dadas hoy + próxima, para ordenar."""
    entries: list[tuple[datetime, TimelineEntry]] = []
    for state in states:
        pauta = state.pauta
        title = f"{pauta.medication} · {pauta.dose}"
        for admin, member_name in state.todays_admins:
            subtitle = f"Dada por {member_name}" if member_name else "Dada"
            entries.append(
                (
                    admin.administered_at,
                    TimelineEntry(
                        type="dose_given",
                        time=admin.administered_at.astimezone(device_tz).strftime(
                            "%H:%M"
                        ),
                        title=title,
                        subtitle=subtitle,
                        status="done",
                        pauta_id=str(pauta.id),
                        administration_id=str(admin.id),
                    ),
                )
            )
        upcoming_status = "pending" if state.next_dose_at <= now else "upcoming"
        entries.append(
            (
                state.next_dose_at,
                TimelineEntry(
                    type="dose_upcoming",
                    time=state.next_dose_at.astimezone(device_tz).strftime("%H:%M"),
                    title=title,
                    subtitle=state.child_name,
                    status=upcoming_status,
                    pauta_id=str(pauta.id),
                ),
            )
        )
    return entries


# ---------- Eventos de hoy (Fase 4) ---------- #


def _event_context(ev: EventOut) -> str | None:
    """Subtítulo de un Evento: Hijo si lo tiene, si no el Tipo."""
    if ev.child:
        return ev.child.name
    if ev.event_type:
        return ev.event_type.name
    return None


def _event_sort_dt(
    ev: EventOut, today: date, device_tz: ZoneInfo | type[UTC]
) -> datetime:
    """Instante de un Evento de hoy para ordenar (día completo → medianoche)."""
    return datetime.combine(today, ev.time or ALL_DAY, tzinfo=device_tz)


def _event_timeline_pairs(
    events: list[EventOut],
    today: date,
    device_tz: ZoneInfo | type[UTC],
) -> list[tuple[datetime, TimelineEntry]]:
    entries: list[tuple[datetime, TimelineEntry]] = []
    for ev in events:
        sort_dt = _event_sort_dt(ev, today, device_tz)
        entries.append(
            (
                sort_dt,
                TimelineEntry(
                    type="event",
                    time=ev.time.strftime("%H:%M") if ev.time else "—",
                    title=ev.title,
                    subtitle=_event_context(ev),
                    status=ev.status,
                    event_id=str(ev.id),
                ),
            )
        )
    return entries


def _event_hero(
    events: list[EventOut],
    today: date,
    device_tz: ZoneInfo | type[UTC],
) -> HeroItem | None:
    """Héroe "Ahora" fallback: el Evento pendiente más inminente de hoy."""
    pending = [ev for ev in events if ev.status == "pending"]
    if not pending:
        return None
    chosen = min(pending, key=lambda ev: _event_sort_dt(ev, today, device_tz))
    context = _event_context(chosen)
    if chosen.time:
        hhmm = chosen.time.strftime("%H:%M")
        subtitle = f"{hhmm} · {context}" if context else hhmm
    else:
        subtitle = context or "Hoy"
    return HeroItem(
        type="event",
        title=chosen.title,
        subtitle=subtitle,
        action_label="Marcar hecho",
        event_id=str(chosen.id),
    )


async def _next_medical_event(session: AsyncSession, today: date) -> EventOut | None:
    """Próximo Evento de tipo Médico (hoy o futuro), o None."""
    result = await session.execute(
        select(Event)
        .join(EventType, Event.event_type_id == EventType.id)
        .where(EventType.name == MEDICAL_TYPE_NAME, Event.date >= today)
        .order_by(Event.date.asc(), Event.time.asc())
        .limit(1)
    )
    ev = result.scalars().first()
    return await _enrich(session, ev) if ev else None


# ---------- Endpoint ---------- #


@router.get("/today", response_model=TodayOut)
async def get_today(
    tz: str | None = Query(default=None),
    session: AsyncSession = Depends(family_session),
) -> TodayOut:
    """Pantalla Hoy: agrega contadores de todas las fases conectadas."""
    device_tz = _device_tz(tz)
    today = datetime.now(device_tz).date()
    now = datetime.now(UTC)

    shopping_pending = (
        await session.execute(
            select(func.count())
            .select_from(ShoppingItem)
            .where(ShoppingItem.status == "pending")
        )
    ).scalar_one()

    # Pautas con finalización automática lazy aplicada.
    pautas = list((await session.execute(select(Pauta))).scalars().all())
    active_pautas: list[Pauta] = []
    finished_count = 0
    lazy_changed = False
    for p in pautas:
        if p.status == "active" and p.is_expired:
            p.status = "finished"
            session.add(p)
            lazy_changed = True
        if p.status == "active":
            active_pautas.append(p)
        else:
            finished_count += 1
    if lazy_changed:
        await session.flush()

    dose_states = await _compute_doses(session, active_pautas, today, device_tz)

    # Eventos de hoy (enriquecidos) para timeline y héroe.
    today_event_rows = list(
        (
            await session.execute(
                select(Event).where(Event.date == today).order_by(Event.time)
            )
        )
        .scalars()
        .all()
    )
    events_today = [await _enrich(session, ev) for ev in today_event_rows]

    # Timeline: tomas + eventos de hoy, orden cronológico por instante absoluto.
    timeline_pairs = _dose_timeline_pairs(dose_states, now, device_tz)
    timeline_pairs += _event_timeline_pairs(events_today, today, device_tz)
    timeline_pairs.sort(key=lambda pair: pair[0])
    timeline = [entry for _, entry in timeline_pairs]

    # Héroe: prioridad de toma (Fase 3); si no, el evento más inminente de hoy.
    hero = _dose_hero(dose_states, now) or _event_hero(events_today, today, device_tz)

    next_medical = await _next_medical_event(session, today)

    return TodayOut(
        hero=hero,
        timeline=timeline,
        summary=TodaySummary(
            shopping_pending_count=shopping_pending,
            pautas_active_count=len(active_pautas),
            pautas_finished_count=finished_count,
            next_medical_event=next_medical,
            children_status="up_to_date",
        ),
    )
