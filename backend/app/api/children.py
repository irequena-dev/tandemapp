import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import Child, ChildCreate, ChildUpdate
from ..tenancy import current_family_id, family_session

router = APIRouter(tags=["children"])


async def _get_owned_child(session: AsyncSession, child_id: uuid.UUID) -> Child:
    """Carga un Hijo de la Familia activa o lanza 404.

    RLS (cláusula USING) ya oculta los Hijos de otras Familias, así que un id
    de otra Familia se comporta como inexistente: 404, nunca 403.
    """
    child = await session.get(Child, child_id)
    if child is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Hijo no encontrado"
        )
    return child


@router.post("/children", status_code=status.HTTP_201_CREATED)
async def create_child(
    data: ChildCreate,
    family_id: str = Depends(current_family_id),
    session: AsyncSession = Depends(family_session),
) -> Child:
    """Da de alta un Hijo en la Familia autenticada.

    El `family_id` lo impone el servidor desde el contexto; coincide con
    `app.current_family_id`, así que el WITH CHECK de RLS lo acepta.
    """
    child = Child(family_id=family_id, name=data.name, birth_date=data.birth_date)
    session.add(child)
    await session.flush()
    await session.refresh(child)
    return child


@router.get("/children")
async def list_children(
    session: AsyncSession = Depends(family_session),
) -> list[Child]:
    """Lista los Hijos de la Familia autenticada (RLS acota las filas)."""
    result = await session.execute(select(Child).order_by(Child.birth_date, Child.name))
    return list(result.scalars().all())


@router.patch("/children/{child_id}")
async def update_child(
    child_id: uuid.UUID,
    data: ChildUpdate,
    session: AsyncSession = Depends(family_session),
) -> Child:
    """Edita parcialmente un Hijo (corrige nombre o fecha de nacimiento)."""
    child = await _get_owned_child(session, child_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(child, field, value)
    session.add(child)
    await session.flush()
    await session.refresh(child)
    return child


@router.delete("/children/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_child(
    child_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> None:
    """Elimina un Hijo de la Familia autenticada."""
    child = await _get_owned_child(session, child_id)
    await session.delete(child)
    await session.flush()
