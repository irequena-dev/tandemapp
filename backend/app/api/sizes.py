"""REST endpoints para Tallas (sizes) de un Hijo — append-only."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from ..models import Child, CurrentSizesOut, Size, SizeCreate, SizeOut, SizeUpdate
from ..tenancy import current_family_id, current_member_id, family_session

router = APIRouter(tags=["sizes"])

# Tipos válidos para filtro (se valida en query param, no Pydantic body).
_VALID_TYPES = {"clothing", "footwear"}


async def _get_owned_child(session: AsyncSession, child_id: uuid.UUID) -> Child:
    child = await session.get(Child, child_id)
    if child is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Hijo no encontrado"
        )
    return child


async def _get_owned_size(
    session: AsyncSession, child_id: uuid.UUID, size_id: uuid.UUID
) -> Size:
    await _get_owned_child(session, child_id)
    size = await session.get(Size, size_id)
    if size is None or size.child_id != child_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Talla no encontrada"
        )
    return size


def _to_out(s: Size) -> SizeOut:
    return SizeOut(
        id=s.id,
        child_id=s.child_id,
        type=s.type,
        label=s.label,
        recorded_at=s.recorded_at,
        recorded_by=s.recorded_by,
        created_at=s.created_at,
    )


@router.get("/children/{child_id}/sizes")
async def list_sizes(
    child_id: uuid.UUID,
    type: str | None = Query(default=None),
    session: AsyncSession = Depends(family_session),
) -> list[SizeOut]:
    await _get_owned_child(session, child_id)
    stmt = select(Size).where(col(Size.child_id) == child_id)
    if type is not None:
        if type not in _VALID_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"type debe ser uno de {sorted(_VALID_TYPES)}",
            )
        stmt = stmt.where(col(Size.type) == type)
    stmt = stmt.order_by(col(Size.recorded_at).desc(), col(Size.created_at).desc())
    result = await session.execute(stmt)
    return [_to_out(s) for s in result.scalars().all()]


@router.get("/children/{child_id}/sizes/current")
async def current_sizes(
    child_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> CurrentSizesOut:
    await _get_owned_child(session, child_id)
    out = CurrentSizesOut()
    for size_type in ("clothing", "footwear"):
        stmt = (
            select(Size)
            .where(col(Size.child_id) == child_id, col(Size.type) == size_type)
            .order_by(col(Size.recorded_at).desc(), col(Size.created_at).desc())
            .limit(1)
        )
        result = await session.execute(stmt)
        row = result.scalars().first()
        if row is not None:
            if size_type == "clothing":
                out.clothing = _to_out(row)
            else:
                out.footwear = _to_out(row)
    return out


@router.post("/children/{child_id}/sizes", status_code=status.HTTP_201_CREATED)
async def create_size(
    child_id: uuid.UUID,
    data: SizeCreate,
    family_id: str = Depends(current_family_id),
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> SizeOut:
    await _get_owned_child(session, child_id)
    size = Size(
        family_id=family_id,
        child_id=child_id,
        type=data.type,
        label=data.label,
        recorded_at=data.recorded_at,
        recorded_by=member_id,
        created_at=datetime.now(UTC),
    )
    session.add(size)
    await session.flush()
    await session.refresh(size)
    return _to_out(size)


@router.patch("/children/{child_id}/sizes/{size_id}")
async def update_size(
    child_id: uuid.UUID,
    size_id: uuid.UUID,
    data: SizeUpdate,
    session: AsyncSession = Depends(family_session),
) -> SizeOut:
    size = await _get_owned_size(session, child_id, size_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(size, field, value)
    session.add(size)
    await session.flush()
    await session.refresh(size)
    return _to_out(size)


@router.delete(
    "/children/{child_id}/sizes/{size_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_size(
    child_id: uuid.UUID,
    size_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> None:
    size = await _get_owned_size(session, child_id, size_id)
    await session.delete(size)
    await session.flush()
