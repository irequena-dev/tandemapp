from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    children,
    event_types,
    health,
    health_visits,
    identity,
    invitations,
    mcp_tokens,
    measurements,
    members,
    pautas,
    shopping_items,
    sizes,
    today,
)
from .config import get_settings
from .mcp.server import build_mcp_app


def create_app() -> FastAPI:
    settings = get_settings()
    mcp_asgi, mcp_lifespan = build_mcp_app()
    app = FastAPI(title="Tándem API", lifespan=mcp_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(identity.router)
    app.include_router(members.router)
    app.include_router(children.router)
    app.include_router(health_visits.router)
    app.include_router(invitations.router)
    app.include_router(event_types.router)
    app.include_router(mcp_tokens.router)
    app.include_router(pautas.router)
    app.include_router(shopping_items.router)
    app.include_router(sizes.router)
    app.include_router(today.router)
    app.include_router(measurements.router)
    # Servidor MCP remoto en `/mcp` (Streamable HTTP) con puerta Bearer (issue 05).
    app.mount("/mcp", mcp_asgi)
    return app


app = create_app()
