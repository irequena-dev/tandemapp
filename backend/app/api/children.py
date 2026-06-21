import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from ..models import (
    Child,
    ChildCreate,
    ChildUpdate,
    ChildWithMetricsOut,
    Measurement,
    Size,
)
from ..tenancy import FamilyScope, family_session

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
    scope: FamilyScope = Depends(family_session),
) -> Child:
    """Da de alta un Hijo en la Familia autenticada.

    El `family_id` lo impone el servidor desde el contexto; coincide con
    `app.current_family_id`, así que el WITH CHECK de RLS lo acepta.
    """
    session = scope.session
    child = Child(
        family_id=scope.family_id,
        name=data.name,
        birth_date=data.birth_date,
        avatar_color=data.avatar_color,
    )
    session.add(child)
    await session.flush()
    await session.refresh(child)
    return child


@router.get("/children")
async def list_children(
    include: str | None = Query(default=None),
    scope: FamilyScope = Depends(family_session),
) -> list[Child] | list[ChildWithMetricsOut]:
    session = scope.session
    """Lista los Hijos de la Familia autenticada (RLS acota las filas).

    Con `?include=current_metrics` enriquece cada Hijo con su última Medida
    y Talla por tipo (derivadas por consulta, nunca almacenadas aparte).
    """
    result = await session.execute(select(Child).order_by(Child.birth_date, Child.name))
    children = list(result.scalars().all())

    if include != "current_metrics":
        return children

    enriched: list[ChildWithMetricsOut] = []
    for child in children:
        height_cm: float | None = None
        weight_kg: float | None = None
        talla: str | None = None
        talla_calzado: str | None = None

        # Última Medida de altura
        stmt = (
            select(Measurement)
            .where(
                col(Measurement.child_id) == child.id,
                Measurement.type == "height",
            )
            .order_by(
                col(Measurement.measured_at).desc(),
                col(Measurement.created_at).desc(),
            )
            .limit(1)
        )
        row = (await session.execute(stmt)).scalar_one_or_none()
        if row is not None:
            height_cm = row.value

        # Última Medida de peso
        stmt = (
            select(Measurement)
            .where(
                col(Measurement.child_id) == child.id,
                Measurement.type == "weight",
            )
            .order_by(
                col(Measurement.measured_at).desc(),
                col(Measurement.created_at).desc(),
            )
            .limit(1)
        )
        row = (await session.execute(stmt)).scalar_one_or_none()
        if row is not None:
            weight_kg = row.value

        # Última Talla de ropa
        stmt = (
            select(Size)
            .where(col(Size.child_id) == child.id, col(Size.type) == "clothing")
            .order_by(col(Size.recorded_at).desc(), col(Size.created_at).desc())
            .limit(1)
        )
        size_row = (await session.execute(stmt)).scalar_one_or_none()
        if size_row is not None:
            talla = size_row.label

        # Última Talla de calzado
        stmt = (
            select(Size)
            .where(col(Size.child_id) == child.id, col(Size.type) == "footwear")
            .order_by(col(Size.recorded_at).desc(), col(Size.created_at).desc())
            .limit(1)
        )
        size_row = (await session.execute(stmt)).scalar_one_or_none()
        if size_row is not None:
            talla_calzado = size_row.label

        enriched.append(
            ChildWithMetricsOut(
                id=child.id,
                family_id=child.family_id,
                name=child.name,
                birth_date=child.birth_date,
                avatar_color=child.avatar_color,
                current_height_cm=height_cm,
                current_weight_kg=weight_kg,
                current_talla=talla,
                current_talla_calzado=talla_calzado,
            )
        )
    return enriched


@router.patch("/children/{child_id}")
async def update_child(
    child_id: uuid.UUID,
    data: ChildUpdate,
    scope: FamilyScope = Depends(family_session),
) -> Child:
    """Edita parcialmente un Hijo (corrige nombre o fecha de nacimiento)."""
    session = scope.session
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
    scope: FamilyScope = Depends(family_session),
) -> None:
    """Elimina un Hijo de la Familia autenticada."""
    session = scope.session
    child = await _get_owned_child(session, child_id)
    await session.delete(child)
    await session.flush()
