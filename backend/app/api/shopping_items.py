import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import ShoppingItem, ShoppingItemCreate, ShoppingItemOut
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


@router.post("/api/shopping-items/{item_id}/buy")
async def buy_shopping_item(
    item_id: uuid.UUID,
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> ShoppingItemOut:
    """Marca un Ítem como comprado (bought) con atribución al Miembro del JWT."""
    item = await _get_item(item_id, session)
    now = datetime.now(UTC)
    item.status = "bought"
    item.bought_by = member_id
    item.bought_at = now
    item.updated_at = now
    session.add(item)
    await session.flush()
    await session.refresh(item)
    return ShoppingItemOut.model_validate(item)


@router.post("/api/shopping-items/{item_id}/undo")
async def undo_shopping_item(
    item_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> ShoppingItemOut:
    """Deshace la compra de un Ítem: vuelve a pending, limpia atribución."""
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
