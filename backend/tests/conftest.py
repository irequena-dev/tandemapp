import os
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer


@pytest.fixture(scope="session")
def postgres() -> Iterator[PostgresContainer]:
    with PostgresContainer("postgres:17-alpine", driver="asyncpg") as pg:
        yield pg


@pytest.fixture(scope="session", autouse=True)
def configure_env(postgres: PostgresContainer) -> Iterator[None]:
    os.environ["DATABASE_URL"] = postgres.get_connection_url()
    os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_dummy")
    os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"

    from app.config import get_settings
    from app.database import get_engine, get_sessionmaker

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()
    yield


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
