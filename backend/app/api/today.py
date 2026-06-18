"""GET /api/today — endpoint agregado para la pantalla Hoy.

Devuelve `TodayOut` con hero, timeline y summary acotados a la Familia del JWT.
Cada fase extiende este endpoint de forma incremental; mientras una fase no esté
conectada, su parte devuelve valores neutros (cero / null / lista vacía).
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Administration, Child, Member, Pauta, ShoppingItem
from ..tenancy import family_session

router = APIRouter(prefix="/api", tags=["today"])

# Ventana para considerar "inminente" la próxima toma y que ocupe el héroe.
# Una toma vencida (next_dose_at en el pasado) siempre es héroe; una que venza
# dentro de esta ventana también. Más allá → la pantalla queda en estado calmado.
HERO_DOSE_IMMINENT_HOURS: int = 2


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
    next_medical_event: None = None  # EventOut | None — always None until Fase 4
    children_status: str  # v1: siempre "up_to_date"


class TodayOut(BaseModel):
    hero: HeroItem | None
    timeline: list[TimelineEntry]
    summary: TodaySummary


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
    today_start: datetime,
) -> list[DoseState]:
    """Para cada Pauta activa calcula next_dose_at y las Administraciones de hoy.

    Carga Hijos y Administraciones en bloque (sin N+1). `next_dose_at` =
    última Administración + intervalo (o `started_at` + intervalo si ninguna).
    """
    if not active_pautas:
        return []

    # Nombres de los Hijos implicados.
    child_ids = {p.child_id for p in active_pautas}
    child_names: dict[uuid.UUID, str] = {}
    if child_ids:
        children_result = await session.execute(
            select(Child).where(Child.id.in_(child_ids))
        )
        for child in children_result.scalars().all():
            child_names[child.id] = child.name

    # Todas las Administraciones de esas Pautas, ordenadas asc.
    pauta_ids = [p.id for p in active_pautas]
    admins_result = await session.execute(
        select(Administration)
        .where(Administration.pauta_id.in_(pauta_ids))
        .order_by(Administration.administered_at.asc())
    )
    all_admins = list(admins_result.scalars().all())

    # Nombres de los Miembros que administraron.
    member_ids = {a.administered_by for a in all_admins}
    member_names: dict[str, str | None] = {}
    if member_ids:
        members_result = await session.execute(
            select(Member).where(Member.id.in_(member_ids))
        )
        for member in members_result.scalars().all():
            member_names[member.id] = member.display_name

    # Agrupar Administraciones por Pauta (asc → la última es el último elemento).
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
            if a.administered_at >= today_start
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
    return HeroItem(
        type="pauta_dose",
        title=f"{pauta.medication} · {pauta.dose}",
        subtitle=(
            f"{chosen.child_name} · Día {pauta.day_number} de {pauta.duration_days}"
        ),
        action_label="Marcar toma",
        pauta_id=str(pauta.id),
    )


def _dose_timeline(states: list[DoseState], now: datetime) -> list[TimelineEntry]:
    """Timeline de tomas: dadas hoy + próxima, en orden cronológico."""
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
                        time=admin.administered_at.strftime("%H:%M"),
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
                    time=state.next_dose_at.strftime("%H:%M"),
                    title=title,
                    subtitle=state.child_name,
                    status=upcoming_status,
                    pauta_id=str(pauta.id),
                ),
            )
        )
    entries.sort(key=lambda pair: pair[0])
    return [entry for _, entry in entries]


# ---------- Endpoint ---------- #


@router.get("/today", response_model=TodayOut)
async def get_today(
    session: AsyncSession = Depends(family_session),
) -> TodayOut:
    """Pantalla Hoy: agrega contadores de todas las fases conectadas."""
    pending_count_result = await session.execute(
        select(func.count())
        .select_from(ShoppingItem)
        .where(ShoppingItem.status == "pending")
    )
    shopping_pending = pending_count_result.scalar_one()

    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Pautas de la Familia con finalización automática lazy aplicada.
    pautas_result = await session.execute(select(Pauta))
    pautas = list(pautas_result.scalars().all())
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

    dose_states = await _compute_doses(session, active_pautas, today_start)
    hero = _dose_hero(dose_states, now)
    timeline = _dose_timeline(dose_states, now)

    return TodayOut(
        hero=hero,
        timeline=timeline,
        summary=TodaySummary(
            shopping_pending_count=shopping_pending,
            pautas_active_count=len(active_pautas),
            pautas_finished_count=finished_count,
            next_medical_event=None,
            children_status="up_to_date",
        ),
    )
