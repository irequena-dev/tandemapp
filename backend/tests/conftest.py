import os
from collections.abc import AsyncIterator, Iterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from testcontainers.postgres import PostgresContainer


@pytest.fixture(scope="session")
def postgres() -> Iterator[PostgresContainer]:
    with PostgresContainer("postgres:17-alpine", driver="asyncpg") as pg:
        yield pg


@pytest.fixture(scope="session", autouse=True)
def configure_env(postgres: PostgresContainer) -> Iterator[None]:
    # `database_url` es la conexión owner (la usan las migraciones); el runtime
    # deriva de ella el rol `tandem_app` (NOSUPERUSER) para que RLS aplique.
    os.environ["DATABASE_URL"] = postgres.get_connection_url()
    os.environ.setdefault("CLERK_SECRET_KEY", "sk_test_dummy")
    os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"
    os.environ["APP_DB_PASSWORD"] = "tandem_app_test_pw"

    from app.config import get_settings
    from app.database import get_engine, get_sessionmaker

    get_settings.cache_clear()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()

    # Crea el esquema, las políticas RLS y el rol de aplicación.
    from alembic.config import Config

    from alembic import command

    command.upgrade(Config("alembic.ini"), "head")
    yield


@pytest_asyncio.fixture
async def app_session() -> AsyncIterator:
    """Sesión conectada como el rol de aplicación (RLS efectiva), sin Familia.

    Para tests de la costura de DB: el llamante controla `app.current_family_id`.
    """
    from app.database import get_sessionmaker

    async with get_sessionmaker()() as session:
        yield session


@pytest_asyncio.fixture
async def admin_session() -> AsyncIterator[AsyncSession]:
    """Sesión como owner (bypasses RLS) para preparar datos de test."""
    from sqlalchemy.ext.asyncio import create_async_engine

    from app.config import get_settings

    engine = create_async_engine(get_settings().database_url, future=True)
    async with AsyncSession(engine) as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def client() -> AsyncIterator[AsyncClient]:
    """Cliente ASGI con la autenticación real de Clerk (para tests de rechazo)."""
    from app.main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.fixture
def identity() -> dict:
    """Claims de Clerk mutables que impersona el `auth_client`."""
    return {}


@pytest_asyncio.fixture
async def auth_client(identity: dict) -> AsyncIterator[AsyncClient]:
    """Cliente ASGI cuya autenticación de Clerk está sustituida.

    Solo se simula la frontera externa (no podemos firmar JWTs reales de
    Clerk); el resto del pipeline (materialización, SET LOCAL, RLS) es real.
    Mutar `identity` cambia el Miembro/Familia activos entre peticiones;
    vaciarlo simula una petición sin sesión válida (401).
    """
    from fastapi import HTTPException, status

    from app.auth import require_auth
    from app.main import app

    def fake_require_auth() -> dict:
        if not identity:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return dict(identity)

    app.dependency_overrides[require_auth] = fake_require_auth
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
    finally:
        app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def mcp_server_port() -> int:
    import socket

    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("", 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest_asyncio.fixture(scope="session", autouse=True)
async def run_mcp_server(configure_env, mcp_server_port: int):
    import asyncio

    import uvicorn

    from app.main import app

    config = uvicorn.Config(
        app=app, host="127.0.0.1", port=mcp_server_port, log_level="warning"
    )
    server = uvicorn.Server(config)
    task = asyncio.create_task(server.serve())
    # Wait for the server to start up
    await asyncio.sleep(0.5)
    yield
    server.should_exit = True
    await task


@pytest.fixture
def mcp_client_factory(mcp_server_port: int):
    from contextlib import asynccontextmanager

    import httpx
    import mcp.client.streamable_http
    from mcp import ClientSession

    @asynccontextmanager
    async def _factory(token: str):
        # El servidor MCP habla Streamable HTTP (no SSE); el cliente debe usar el
        # mismo transporte. Los headers de autenticación viajan en el httpx client.
        url = f"http://127.0.0.1:{mcp_server_port}/mcp/"
        headers = {"Authorization": f"Bearer {token}"}
        async with (
            httpx.AsyncClient(headers=headers) as http_client,
            mcp.client.streamable_http.streamable_http_client(
                url=url, http_client=http_client
            ) as (read, write, _get_session_id),
            ClientSession(read, write) as session,
        ):
            await session.initialize()
            yield session

    return _factory
