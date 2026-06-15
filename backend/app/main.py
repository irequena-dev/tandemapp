from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import children, health, identity, mcp_tokens, members
from .config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Tándem API")
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
    app.include_router(mcp_tokens.router)
    return app


app = create_app()
