import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import (
    Child,
    HealthVisit,
    HealthVisitCreate,
    HealthVisitOut,
    HealthVisitUpdate,
)
from ..tenancy import FamilyScope, family_session

router = APIRouter(tags=["health-visits"])


async def _get_owned_child(session: AsyncSession, child_id: uuid.UUID) -> Child:
    child = await session.get(Child, child_id)
    if child is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Hijo no encontrado"
        )
    return child


async def _get_owned_visit(
    session: AsyncSession, child_id: uuid.UUID, visit_id: uuid.UUID
) -> HealthVisit:
    visit = await session.get(HealthVisit, visit_id)
    if visit is None or visit.child_id != child_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Visita médica no encontrada",
        )
    return visit


def _to_out(visit: HealthVisit) -> HealthVisitOut:
    return HealthVisitOut(
        id=visit.id,
        child_id=visit.child_id,
        family_id=visit.family_id,
        visited_at=visit.visited_at,
        diagnosis=visit.diagnosis,
        notes=visit.notes,
        pauta_ids=[],
        created_by=visit.created_by,
        created_at=visit.created_at,
    )


@router.get("/children/{child_id}/health-visits")
async def list_health_visits(
    child_id: uuid.UUID,
    date_from: date | None = Query(None, alias="from"),
    date_to: date | None = Query(None, alias="to"),
    scope: FamilyScope = Depends(family_session),
) -> list[HealthVisitOut]:
    session = scope.session
    await _get_owned_child(session, child_id)
    stmt = select(HealthVisit).where(HealthVisit.child_id == child_id)
    if date_from:
        stmt = stmt.where(HealthVisit.visited_at >= date_from)
    if date_to:
        stmt = stmt.where(HealthVisit.visited_at <= date_to)
    stmt = stmt.order_by(HealthVisit.visited_at.desc())
    result = await session.execute(stmt)
    return [_to_out(v) for v in result.scalars().all()]


@router.post("/children/{child_id}/health-visits", status_code=status.HTTP_201_CREATED)
async def create_health_visit(
    child_id: uuid.UUID,
    data: HealthVisitCreate,
    scope: FamilyScope = Depends(family_session),
) -> HealthVisitOut:
    session = scope.session
    await _get_owned_child(session, child_id)
    visit = HealthVisit(
        family_id=scope.family_id,
        child_id=child_id,
        visited_at=data.visited_at,
        diagnosis=data.diagnosis,
        notes=data.notes,
        created_by=scope.member_id,
    )
    session.add(visit)
    await session.flush()
    await session.refresh(visit)
    return _to_out(visit)


@router.get("/children/{child_id}/health-visits/{visit_id}")
async def get_health_visit(
    child_id: uuid.UUID,
    visit_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> HealthVisitOut:
    visit = await _get_owned_visit(scope.session, child_id, visit_id)
    return _to_out(visit)


@router.patch("/children/{child_id}/health-visits/{visit_id}")
async def update_health_visit(
    child_id: uuid.UUID,
    visit_id: uuid.UUID,
    data: HealthVisitUpdate,
    scope: FamilyScope = Depends(family_session),
) -> HealthVisitOut:
    session = scope.session
    visit = await _get_owned_visit(session, child_id, visit_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(visit, field, value)
    session.add(visit)
    await session.flush()
    await session.refresh(visit)
    return _to_out(visit)


@router.delete(
    "/children/{child_id}/health-visits/{visit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_health_visit(
    child_id: uuid.UUID,
    visit_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> None:
    session = scope.session
    visit = await _get_owned_visit(session, child_id, visit_id)
    await session.delete(visit)
    await session.flush()
