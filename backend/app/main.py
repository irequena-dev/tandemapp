from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import (
    administrations,
    children,
    event_types,
    events,
    health,
    health_visits,
    identity,
    invitations,
    mcp_tokens,
    measurements,
    members,
    pautas,
    series,
    shopping_items,
    sizes,
    today,
)
from .config import get_settings
from .mcp.server import build_mcp_app


class McpCorsMiddleware:
    """Middleware ASGI para asegurar que las peticiones CORS en /mcp sean permisivas
    (necesario para clientes móviles MCP como Edge Gallery).
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"].startswith("/mcp"):
            req_headers = {k.decode().lower(): v for k, v in scope.get("headers", [])}
            origin = req_headers.get("origin", b"*")

            method = scope.get("method")
            if method == "OPTIONS":
                headers = [
                    (b"access-control-allow-origin", origin),
                    (b"access-control-allow-methods", b"GET, POST, OPTIONS"),
                    (b"access-control-allow-headers", b"authorization, content-type"),
                    (b"access-control-allow-credentials", b"true"),
                ]
                await send(
                    {"type": "http.response.start", "status": 200, "headers": headers}
                )
                await send({"type": "http.response.body", "body": b""})
                return

            async def send_wrapper(message):
                if message["type"] == "http.response.start":
                    headers_dict = {}
                    for k, v in message.get("headers", []):
                        headers_dict[k.lower()] = v
                    headers_dict[b"access-control-allow-origin"] = origin
                    headers_dict[b"access-control-allow-methods"] = (
                        b"GET, POST, OPTIONS"
                    )
                    headers_dict[b"access-control-allow-headers"] = (
                        b"authorization, content-type"
                    )
                    headers_dict[b"access-control-allow-credentials"] = b"true"
                    message["headers"] = list(headers_dict.items())
                await send(message)

            await self.app(scope, receive, send_wrapper)
            return

        await self.app(scope, receive, send)


def create_app() -> FastAPI:
    settings = get_settings()
    mcp_asgi, mcp_lifespan = build_mcp_app()
    app = FastAPI(title="Tándem API", lifespan=mcp_lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.frontend_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(McpCorsMiddleware)
    app.include_router(health.router)
    app.include_router(identity.router)
    app.include_router(members.router)
    app.include_router(children.router)
    app.include_router(health_visits.router)
    app.include_router(invitations.router)
    app.include_router(event_types.router)
    app.include_router(events.router)
    app.include_router(series.router)
    app.include_router(mcp_tokens.router)
    app.include_router(pautas.router)
    app.include_router(administrations.router)
    app.include_router(shopping_items.router)
    app.include_router(sizes.router)
    app.include_router(today.router)
    app.include_router(measurements.router)
    # Servidor MCP remoto en `/mcp` (Streamable HTTP) con puerta Bearer (issue 05).
    app.mount("/mcp", mcp_asgi)
    return app


app = create_app()
