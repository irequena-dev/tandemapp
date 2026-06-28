"""Series recurrentes acotadas (Fase 4, ADR-0003).

Una Serie es solo generador: al crearse materializa todas sus ocurrencias como
Eventos independientes (cada uno con su `series_id`). `DELETE /future` borra las
ocurrencias futuras sin tocar las pasadas/marcadas. Sin edición en cascada:
recalendarizar = borrar futuras + crear otra Serie.
"""

import calendar
import uuid
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Event, Series, SeriesCreate, SeriesCreatedOut
from ..tenancy import FamilyScope, family_session

router = APIRouter(prefix="/api", tags=["series"])


def _first_weekday(starts_at: date, day_of_week: int) -> date:
    """Primera fecha >= starts_at cuyo día de la semana coincide con el ancla."""
    delta = (day_of_week - starts_at.weekday()) % 7
    return starts_at + timedelta(days=delta)


def _add_months(anchor: date, months: int) -> date:
    """Suma `months` a `anchor` conservando su día de mes (con clamp a fin de mes)."""
    base_month = anchor.month - 1 + months  # 0-based
    year = anchor.year + base_month // 12
    month = base_month % 12 + 1  # 1-based
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(anchor.day, last_day))


def compute_occurrences(
    cadence: str,
    day_of_week: int | None,
    starts_at: date,
    ends_at: date | None,
    max_count: int | None,
) -> list[date]:
    """Fechas de las ocurrencias materializadas de una Serie acotada.

    - weekly/biweekly: 1ª ocurrencia >= starts_at con `day_of_week`, paso 7/14 días.
    - monthly: día de mes de `starts_at`, +1 mes con clamp a fin de mes.
    Acotada por `ends_at` (fecha incluida) o `max_count` (nº de ocurrencias).
    """
    if cadence == "monthly":
        first = starts_at  # el día de mes ancla es el de starts_at
    else:
        if day_of_week is None:  # pragma: no cover - validado en SeriesCreate
            msg = "day_of_week es obligatorio para weekly/biweekly"
            raise ValueError(msg)
        first = _first_weekday(starts_at, day_of_week)

    occurrences: list[date] = []
    index = 0
    while (
        ends_at is None or first_at(cadence, starts_at, first, index) <= ends_at
    ) and (max_count is None or len(occurrences) < max_count):
        occurrences.append(first_at(cadence, starts_at, first, index))
        index += 1
    return occurrences


def first_at(cadence: str, starts_at: date, first: date, index: int) -> date:
    """Fecha de la ocurrencia `index`-ésima (0 = primera) desde el ancla."""
    if cadence == "monthly":
        return _add_months(starts_at, index)
    step_days = 7 if cadence == "weekly" else 14
    return first + timedelta(days=step_days * index)


@router.post(
    "/series", response_model=SeriesCreatedOut, status_code=status.HTTP_201_CREATED
)
async def create_series(
    data: SeriesCreate,
    scope: FamilyScope = Depends(family_session),
) -> SeriesCreatedOut:
    """Crea una Serie acotada y materializa todas sus ocurrencias como Eventos."""
    session = scope.session
    occurrences = compute_occurrences(
        data.cadence,
        data.day_of_week,
        data.starts_at,
        data.ends_at,
        data.max_count,
    )

    series = Series(
        family_id=scope.family_id,
        cadence=data.cadence,
        day_of_week=data.day_of_week,
        starts_at=data.starts_at,
        ends_at=data.ends_at,
        max_count=data.max_count,
    )
    session.add(series)
    await session.flush()  # obtiene series.id

    for occ_date in occurrences:
        session.add(
            Event(
                family_id=scope.family_id,
                title=data.title,
                date=occ_date,
                time=data.time,
                event_type_id=data.event_type_id,
                child_id=data.child_id,
                series_id=series.id,
                created_by=scope.member_id,
            )
        )
    await session.flush()

    return SeriesCreatedOut(id=series.id, events_created=len(occurrences))


async def _get_owned_series(session: AsyncSession, series_id: uuid.UUID) -> Series:
    """Carga una Serie de la Familia activa o lanza 404 (RLS filtra)."""
    series = await session.get(Series, series_id)
    if series is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Serie no encontrada"
        )
    return series


@router.delete("/series/{series_id}/future", status_code=status.HTTP_204_NO_CONTENT)
async def delete_future_occurrences(
    series_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> None:
    """Borra las ocurrencias futuras de una Serie, sin tocar pasadas/marcadas."""
    session = scope.session
    await _get_owned_series(session, series_id)
    today = datetime.now(UTC).date()
    await session.execute(
        delete(Event).where(
            Event.series_id == series_id,
            Event.date > today,
            Event.status != "done",
        )
    )
    await session.flush()
