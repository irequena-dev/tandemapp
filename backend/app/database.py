from collections.abc import AsyncIterator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from .config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    # Runtime conecta como el rol de aplicación (NOSUPERUSER): así RLS se aplica
    # de verdad. Las migraciones (Alembic) usan la URL de owner por separado.
    return create_async_engine(
        get_settings().app_database_url, future=True, pool_pre_ping=True
    )


@lru_cache
def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session
