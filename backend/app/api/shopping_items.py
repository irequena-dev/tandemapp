import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import delete, select

from ..models import (
    ShoppingItem,
    ShoppingItemCreate,
    ShoppingItemOut,
    ShoppingItemUpdate,
)
from ..tenancy import current_family_id, current_member_id, family_session

router = APIRouter(tags=["shopping-items"])


@router.get("/api/shopping-items")
async def list_shopping_items(
    session: AsyncSession = Depends(family_session),
) -> list[ShoppingItemOut]:
    """Lista los Ítems de compra de la Familia autenticada (RLS acota)."""
    result = await session.execute(
        select(ShoppingItem).order_by(ShoppingItem.created_at)
    )
    return [ShoppingItemOut.model_validate(row) for row in result.scalars().all()]


@router.post("/api/shopping-items", status_code=201)
async def create_shopping_item(
    data: ShoppingItemCreate,
    family_id: str = Depends(current_family_id),
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> ShoppingItemOut:
    """Da de alta un Ítem de compra (texto libre, estado `pending`)."""
    now = datetime.now(UTC)
    item = ShoppingItem(
        family_id=family_id,
        text=data.text,
        status="pending",
        created_by=member_id,
        created_at=now,
        updated_at=now,
    )
    session.add(item)
    await session.flush()
    await session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.patch("/api/shopping-items/{item_id}")
async def update_shopping_item(
    item_id: uuid.UUID,
    data: ShoppingItemUpdate,
    session: AsyncSession = Depends(family_session),
) -> ShoppingItemOut:
    """Edita el texto libre de un Ítem de compra (RLS acota a la Familia)."""
    result = await session.execute(
        select(ShoppingItem).where(ShoppingItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    item.text = data.text
    item.updated_at = datetime.now(UTC)
    await session.flush()
    await session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.delete("/api/shopping-items/bought", status_code=204)
async def clear_bought_shopping_items(
    session: AsyncSession = Depends(family_session),
) -> Response:
    """Elimina todos los Ítems comprados de la Familia (hard delete)."""
    await session.execute(delete(ShoppingItem).where(ShoppingItem.status == "bought"))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/shopping-items/{item_id}", status_code=204)
async def delete_shopping_item(
    item_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> Response:
    """Borra un Ítem de compra (hard delete, RLS acota a la Familia)."""
    result = await session.execute(
        select(ShoppingItem).where(ShoppingItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    await session.delete(item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
