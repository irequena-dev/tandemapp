"""GET /api/today — endpoint agregado para la pantalla Hoy.

Devuelve `TodayOut` con hero, timeline y summary acotados a la Familia del JWT.
En esta primera entrega (sin fases de dominio conectadas), devuelve la forma
completa del contrato pero "vacía": hero=null, timeline=[], contadores en cero.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

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
    """Pantalla Hoy: estado calmado (sin fases de dominio conectadas aún)."""
    return TodayOut(
        hero=None,
        timeline=[],
        summary=TodaySummary(
            shopping_pending_count=0,
            pautas_active_count=0,
            pautas_finished_count=0,
            next_medical_event=None,
            children_status="up_to_date",
        ),
    )
