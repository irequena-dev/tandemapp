from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_session

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(session: AsyncSession = Depends(get_session)) -> dict:
    """Comprueba que el backend está vivo y conectado a Postgres."""
    await session.execute(text("SELECT 1"))
    return {"status": "ok"}
