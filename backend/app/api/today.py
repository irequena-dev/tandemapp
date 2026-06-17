"""GET /api/today — endpoint agregado para la pantalla Hoy.

Devuelve `TodayOut` con hero, timeline y summary acotados a la Familia del JWT.
Cada fase extiende este endpoint de forma incremental; mientras una fase no esté
conectada, su parte devuelve valores neutros (cero / null / lista vacía).
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ShoppingItem
from ..tenancy import family_session

router = APIRouter(prefix="/api", tags=["today"])


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

    return TodayOut(
        hero=None,
        timeline=[],
        summary=TodaySummary(
            shopping_pending_count=shopping_pending,
            pautas_active_count=0,
            pautas_finished_count=0,
            next_medical_event=None,
            children_status="up_to_date",
        ),
    )
