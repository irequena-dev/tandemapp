import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import EventType, EventTypeCreate, EventTypeOut, EventTypeUpdate
from ..tenancy import FamilyScope, family_session

router = APIRouter(tags=["event-types"])


async def _get_event_type(session: AsyncSession, type_id: uuid.UUID) -> EventType:
    """Carga un Tipo de Evento visible (RLS filtra) o lanza 404."""
    et = await session.get(EventType, type_id)
    if et is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tipo de Evento no encontrado",
        )
    return et


def _guard_system(et: EventType) -> None:
    """Impide modificar un tipo base del sistema."""
    if et.is_system:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No se puede modificar un tipo base del sistema",
        )


@router.get("/event-types")
async def list_event_types(
    scope: FamilyScope = Depends(family_session),
) -> list[EventTypeOut]:
    """Lista los Tipos de Evento visibles: base (is_system) + personalizados."""
    result = await scope.session.execute(select(EventType).order_by(EventType.name))
    return [EventTypeOut.model_validate(et) for et in result.scalars().all()]


@router.post("/event-types", status_code=status.HTTP_201_CREATED)
async def create_event_type(
    data: EventTypeCreate,
    scope: FamilyScope = Depends(family_session),
) -> EventTypeOut:
    """Crea un Tipo de Evento personalizado para la Familia."""
    et = EventType(family_id=scope.family_id, name=data.name, icon=data.icon)
    scope.session.add(et)
    await scope.session.flush()
    await scope.session.refresh(et)
    return EventTypeOut.model_validate(et)


@router.patch("/event-types/{type_id}")
async def update_event_type(
    type_id: uuid.UUID,
    data: EventTypeUpdate,
    scope: FamilyScope = Depends(family_session),
) -> EventTypeOut:
    """Edita un Tipo de Evento personalizado (no base)."""
    session = scope.session
    et = await _get_event_type(session, type_id)
    _guard_system(et)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(et, field, value)
    session.add(et)
    await session.flush()
    await session.refresh(et)
    return EventTypeOut.model_validate(et)


@router.delete("/event-types/{type_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_event_type(
    type_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> None:
    """Elimina un Tipo de Evento personalizado (no base)."""
    session = scope.session
    et = await _get_event_type(session, type_id)
    _guard_system(et)
    await session.delete(et)
    await session.flush()
