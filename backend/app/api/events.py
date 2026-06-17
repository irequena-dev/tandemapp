import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import (
    Child,
    ChildOut,
    Event,
    EventCreate,
    EventOut,
    EventType,
    EventTypeOut,
    EventUpdate,
)
from ..tenancy import current_family_id, current_member_id, family_session

router = APIRouter(tags=["events"])


async def _enrich(session: AsyncSession, ev: Event) -> EventOut:
    """Enriquece un Evento con su Tipo y Hijo expandidos + is_overdue calculado."""
    et = await session.get(EventType, ev.event_type_id)
    child: Child | None = None
    if ev.child_id:
        child = await session.get(Child, ev.child_id)

    today = datetime.now(UTC).date()
    is_overdue = ev.status == "pending" and ev.date < today

    return EventOut(
        id=ev.id,
        family_id=ev.family_id,
        title=ev.title,
        date=ev.date,
        time=ev.time,
        event_type_id=ev.event_type_id,
        event_type=EventTypeOut.model_validate(et),
        child_id=ev.child_id,
        child=ChildOut.model_validate(child) if child else None,
        status=ev.status,
        is_overdue=is_overdue,
        series_id=ev.series_id,
        created_by=ev.created_by,
        created_at=ev.created_at,
    )


async def _get_owned_event(session: AsyncSession, event_id: uuid.UUID) -> Event:
    """Carga un Evento de la Familia activa o lanza 404 (RLS filtra)."""
    ev = await session.get(Event, event_id)
    if ev is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Evento no encontrado"
        )
    return ev


@router.get("/events")
async def list_events(
    type_id: uuid.UUID | None = Query(default=None),
    child_id: uuid.UUID | None = Query(default=None),
    session: AsyncSession = Depends(family_session),
) -> list[EventOut]:
    """Lista Eventos de la Familia con filtros opcionales, ordenados por fecha ASC."""
    stmt = select(Event)
    if type_id is not None:
        stmt = stmt.where(Event.event_type_id == type_id)
    if child_id is not None:
        stmt = stmt.where(Event.child_id == child_id)
    stmt = stmt.order_by(Event.date, Event.time)

    result = await session.execute(stmt)
    events = list(result.scalars().all())
    return [await _enrich(session, ev) for ev in events]


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    family_id: str = Depends(current_family_id),
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> EventOut:
    """Crea un Evento en la Familia autenticada."""
    ev = Event(
        family_id=family_id,
        title=data.title,
        date=data.date,
        time=data.time,
        event_type_id=data.event_type_id,
        child_id=data.child_id,
        created_by=member_id,
    )
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)


@router.get("/events/{event_id}")
async def get_event(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> EventOut:
    """Devuelve un Evento por id."""
    ev = await _get_owned_event(session, event_id)
    return await _enrich(session, ev)


@router.patch("/events/{event_id}")
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    session: AsyncSession = Depends(family_session),
) -> EventOut:
    """Edita parcialmente un Evento."""
    ev = await _get_owned_event(session, event_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ev, field, value)
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> None:
    """Elimina un Evento."""
    ev = await _get_owned_event(session, event_id)
    await session.delete(ev)
    await session.flush()


@router.post("/events/{event_id}/done")
async def mark_done(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> EventOut:
    """Marca un Evento como hecho (solo manual)."""
    ev = await _get_owned_event(session, event_id)
    ev.status = "done"
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)


@router.post("/events/{event_id}/undo")
async def mark_undo(
    event_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> EventOut:
    """Deshace el marcado de un Evento (vuelve a pendiente)."""
    ev = await _get_owned_event(session, event_id)
    ev.status = "pending"
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)
