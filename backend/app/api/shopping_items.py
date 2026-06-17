from datetime import UTC, datetime

from fastapi import APIRouter, Depends
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
