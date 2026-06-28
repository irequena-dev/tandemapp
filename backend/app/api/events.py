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
    Member,
    MemberOut,
)
from ..tenancy import FamilyScope, family_session

router = APIRouter(tags=["events"])


async def load_event_views(
    session: AsyncSession, events: list[Event]
) -> list[EventOut]:
    """Enriquece N Eventos con batch-loading: 1 SELECT por entidad (EventType,
    Child, Member), no N+1. Calcula is_overdue por Evento."""
    if not events:
        return []

    event_type_ids = {ev.event_type_id for ev in events}
    types: dict = {}
    if event_type_ids:
        ets = (
            (
                await session.execute(
                    select(EventType).where(EventType.id.in_(event_type_ids))
                )
            )
            .scalars()
            .all()
        )
        types = {et.id: et for et in ets}

    child_ids = {ev.child_id for ev in events if ev.child_id}
    children: dict = {}
    if child_ids:
        chs = (
            (await session.execute(select(Child).where(Child.id.in_(child_ids))))
            .scalars()
            .all()
        )
        children = {c.id: c for c in chs}

    member_ids = {ev.member_id for ev in events if ev.member_id}
    members: dict = {}
    if member_ids:
        mems = (
            (await session.execute(select(Member).where(Member.id.in_(member_ids))))
            .scalars()
            .all()
        )
        members = {m.id: m for m in mems}

    today = datetime.now(UTC).date()
    views: list[EventOut] = []
    for ev in events:
        is_overdue = ev.status == "pending" and ev.date < today
        # `.get` (no subíndice): si una FK huérfana desaparece, degrada a None
        # igual que el `session.get` original, en vez de KeyError.
        child = children.get(ev.child_id) if ev.child_id else None
        member = members.get(ev.member_id) if ev.member_id else None
        views.append(
            EventOut(
                id=ev.id,
                family_id=ev.family_id,
                title=ev.title,
                date=ev.date,
                time=ev.time,
                event_type_id=ev.event_type_id,
                event_type=EventTypeOut.model_validate(types[ev.event_type_id]),
                child_id=ev.child_id,
                child=ChildOut.model_validate(child) if child else None,
                member_id=ev.member_id,
                member=MemberOut.model_validate(member) if member else None,
                status=ev.status,
                is_overdue=is_overdue,
                series_id=ev.series_id,
                created_by=ev.created_by,
                created_at=ev.created_at,
            )
        )
    return views


async def _enrich(session: AsyncSession, ev: Event) -> EventOut:
    """Wrapper de un solo Evento sobre `load_event_views` (batch-loading)."""
    return (await load_event_views(session, [ev]))[0]


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
    member_id: str | None = Query(default=None),
    scope: FamilyScope = Depends(family_session),
) -> list[EventOut]:
    """Lista Eventos de la Familia con filtros opcionales, ordenados por fecha ASC."""
    session = scope.session
    stmt = select(Event)
    if type_id is not None:
        stmt = stmt.where(Event.event_type_id == type_id)
    if child_id is not None:
        stmt = stmt.where(Event.child_id == child_id)
    if member_id is not None:
        stmt = stmt.where(Event.member_id == member_id)
    stmt = stmt.order_by(Event.date, Event.time)

    result = await session.execute(stmt)
    events = list(result.scalars().all())
    return await load_event_views(session, events)


@router.post("/events", status_code=status.HTTP_201_CREATED)
async def create_event(
    data: EventCreate,
    scope: FamilyScope = Depends(family_session),
) -> EventOut:
    """Crea un Evento en la Familia autenticada."""
    session = scope.session

    # Validar que member_id pertenece a la Familia
    if data.member_id is not None:
        member = await session.get(Member, data.member_id)
        if member is None or member.family_id != scope.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El Miembro no pertenece a esta Familia",
            )

    ev = Event(
        family_id=scope.family_id,
        title=data.title,
        date=data.date,
        time=data.time,
        event_type_id=data.event_type_id,
        child_id=data.child_id,
        member_id=data.member_id,
        created_by=scope.member_id,
    )
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)


@router.get("/events/{event_id}")
async def get_event(
    event_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> EventOut:
    """Devuelve un Evento por id."""
    ev = await _get_owned_event(scope.session, event_id)
    return await _enrich(scope.session, ev)


@router.patch("/events/{event_id}")
async def update_event(
    event_id: uuid.UUID,
    data: EventUpdate,
    scope: FamilyScope = Depends(family_session),
) -> EventOut:
    """Edita parcialmente un Evento."""
    session = scope.session
    ev = await _get_owned_event(session, event_id)
    # Validar pertenencia del Miembro ANTES del loop: model_dump(exclude_unset=True)
    # distingue "member_id": "x" (set), "member_id": null (clear) y omitido (no-op).
    if (
        "member_id" in data.model_dump(exclude_unset=True)
        and data.member_id is not None
    ):
        member = await session.get(Member, data.member_id)
        if member is None or member.family_id != scope.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El Miembro no pertenece a esta Familia",
            )
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(ev, field, value)
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event(
    event_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> None:
    """Elimina un Evento."""
    session = scope.session
    ev = await _get_owned_event(session, event_id)
    await session.delete(ev)
    await session.flush()


@router.post("/events/{event_id}/done")
async def mark_done(
    event_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> EventOut:
    """Marca un Evento como hecho (solo manual)."""
    session = scope.session
    ev = await _get_owned_event(session, event_id)
    ev.status = "done"
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)


@router.post("/events/{event_id}/undo")
async def mark_undo(
    event_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> EventOut:
    """Deshace el marcado de un Evento (vuelve a pendiente)."""
    session = scope.session
    ev = await _get_owned_event(session, event_id)
    ev.status = "pending"
    session.add(ev)
    await session.flush()
    await session.refresh(ev)
    return await _enrich(session, ev)
