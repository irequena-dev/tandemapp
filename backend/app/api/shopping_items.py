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
from ..tenancy import FamilyScope, family_session

router = APIRouter(tags=["shopping-items"])


@router.get("/api/shopping-items")
async def list_shopping_items(
    scope: FamilyScope = Depends(family_session),
) -> list[ShoppingItemOut]:
    """Lista los Ítems de compra de la Familia autenticada (RLS acota)."""
    result = await scope.session.execute(
        select(ShoppingItem).order_by(ShoppingItem.created_at)
    )
    return [ShoppingItemOut.model_validate(row) for row in result.scalars().all()]


@router.post("/api/shopping-items", status_code=201)
async def create_shopping_item(
    data: ShoppingItemCreate,
    scope: FamilyScope = Depends(family_session),
) -> ShoppingItemOut:
    """Da de alta un Ítem de compra (texto libre, estado `pending`)."""
    now = datetime.now(UTC)
    item = ShoppingItem(
        family_id=scope.family_id,
        text=data.text,
        status="pending",
        created_by=scope.member_id,
        created_at=now,
        updated_at=now,
    )
    scope.session.add(item)
    await scope.session.flush()
    await scope.session.refresh(item)
    return ShoppingItemOut.model_validate(item)


async def _get_item(item_id: uuid.UUID, session: AsyncSession) -> ShoppingItem:
    """Busca un Ítem de compra por id (RLS ya acota a la Familia)."""
    result = await session.execute(
        select(ShoppingItem).where(ShoppingItem.id == item_id)
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ítem de compra no encontrado",
        )
    return item


@router.patch("/api/shopping-items/{item_id}")
async def update_shopping_item(
    item_id: uuid.UUID,
    data: ShoppingItemUpdate,
    scope: FamilyScope = Depends(family_session),
) -> ShoppingItemOut:
    """Edita el texto libre de un Ítem de compra (RLS acota a la Familia)."""
    session = scope.session
    item = await _get_item(item_id, session)
    item.text = data.text
    item.updated_at = datetime.now(UTC)
    await session.flush()
    await session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.post("/api/shopping-items/{item_id}/buy")
async def buy_shopping_item(
    item_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> ShoppingItemOut:
    """Marca un Ítem como comprado (bought) con atribución al Miembro del JWT."""
    session = scope.session
    item = await _get_item(item_id, session)
    now = datetime.now(UTC)
    item.status = "bought"
    item.bought_by = scope.member_id
    item.bought_at = now
    item.updated_at = now
    session.add(item)
    await session.flush()
    await session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.post("/api/shopping-items/{item_id}/undo")
async def undo_shopping_item(
    item_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> ShoppingItemOut:
    """Deshace la compra de un Ítem: vuelve a pending, limpia atribución."""
    session = scope.session
    item = await _get_item(item_id, session)
    now = datetime.now(UTC)
    item.status = "pending"
    item.bought_by = None
    item.bought_at = None
    item.updated_at = now
    session.add(item)
    await session.flush()
    await session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.delete("/api/shopping-items/bought", status_code=204)
async def clear_bought_shopping_items(
    scope: FamilyScope = Depends(family_session),
) -> Response:
    """Elimina todos los Ítems comprados de la Familia (hard delete)."""
    await scope.session.execute(
        delete(ShoppingItem).where(ShoppingItem.status == "bought")
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/api/shopping-items/{item_id}", status_code=204)
async def delete_shopping_item(
    item_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> Response:
    """Borra un Ítem de compra (hard delete, RLS acota a la Familia)."""
    session = scope.session
    item = await _get_item(item_id, session)
    await session.delete(item)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
