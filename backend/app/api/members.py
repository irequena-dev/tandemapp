from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import Member
from ..tenancy import family_session

router = APIRouter(tags=["members"])


@router.get("/members")
async def list_members(session: AsyncSession = Depends(family_session)) -> list[Member]:
    """Lista los Miembros de la Familia autenticada.

    RLS garantiza que solo se devuelven los de la Familia activa.
    """
    result = await session.execute(select(Member))
    return list(result.scalars().all())
