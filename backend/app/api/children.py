import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import select

from ..current_values import latest_measurement, latest_size
from ..models import (
    Child,
    ChildCreate,
    ChildUpdate,
    ChildWithMetricsOut,
)
from ..tenancy import FamilyScope, family_session
from .children_access import get_owned_child

router = APIRouter(tags=["children"])


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
        height = await latest_measurement(session, child.id, "height")
        weight = await latest_measurement(session, child.id, "weight")
        clothing = await latest_size(session, child.id, "clothing")
        footwear = await latest_size(session, child.id, "footwear")

        enriched.append(
            ChildWithMetricsOut(
                id=child.id,
                family_id=child.family_id,
                name=child.name,
                birth_date=child.birth_date,
                avatar_color=child.avatar_color,
                current_height_cm=height.value if height else None,
                current_weight_kg=weight.value if weight else None,
                current_talla=clothing.label if clothing else None,
                current_talla_calzado=footwear.label if footwear else None,
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
    child = await get_owned_child(session, child_id)
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
    child = await get_owned_child(session, child_id)
    await session.delete(child)
    await session.flush()
