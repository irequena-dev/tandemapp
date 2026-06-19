from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import SQLModel, select

from ..models import Member
from ..tenancy import current_member_id, family_session

router = APIRouter(tags=["members"])


@router.get("/members")
async def list_members(session: AsyncSession = Depends(family_session)) -> list[Member]:
    """Lista los Miembros de la Familia autenticada.

    RLS garantiza que solo se devuelven los de la Familia activa.
    """
    result = await session.execute(select(Member))
    return list(result.scalars().all())


class MemberDisplayNameUpdate(SQLModel):
    display_name: str


@router.patch("/members/me/display-name")
async def update_my_display_name(
    body: MemberDisplayNameUpdate,
    session: AsyncSession = Depends(family_session),
    member_id: str = Depends(current_member_id),
) -> Member:
    """Actualiza el display_name del Miembro autenticado."""
    result = await session.execute(select(Member).where(Member.id == member_id))
    member = result.scalar_one_or_none()
    if not member:
        raise ValueError("Miembro no encontrado")
    
    member.display_name = body.display_name.strip()
    await session.commit()
    return member
