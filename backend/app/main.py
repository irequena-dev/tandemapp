import json
import logging

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
    push,
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
        if scope["type"] == "http" and (
            scope["path"] == "/mcp" or scope["path"].startswith("/mcp/")
        ):
            # Normalizar `/mcp` -> `/mcp/` antes del router. El `Mount("/mcp", ...)`
            # de Starlette responde a `/mcp/` pero a `/mcp` emite un 307 redirect que
            # los clientes MCP (POST sin seguimiento) no toleran. (issue 05)
            if scope["path"] == "/mcp":
                scope["path"] = "/mcp/"
                scope["raw_path"] = b"/mcp/"

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


# Logger dedicado al tráfico MCP. Visible en `docker logs tandem-backend`.
# Propósito: diagnosticar bucles de Edge Gallery (¿llega tools/call o no?).
mcp_request_logger = logging.getLogger("tandem.mcp.requests")


class McpRequestLoggingMiddleware:
    """Registra cada petición MCP que llega al backend (método HTTP + JSON-RPC
    method + id + sesión + status de respuesta).

    Vive en la capa de middleware (envuelve al router), así que ve TODO el
    tráfico /mcp antes de que FastAPI/Starlette enruten. Si durante un bucle de
    Edge Gallery este logger no muestra `tools/call`, entonces la petición no
    llega al backend (problema de cliente o de proxy intermedio). (issue 05)
    """

    def __init__(self, app):
        self.app = app

    @staticmethod
    def _is_mcp(scope) -> bool:
        path = scope.get("path", "")
        return path == "/mcp" or path.startswith("/mcp/")

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http" or not self._is_mcp(scope):
            await self.app(scope, receive, send)
            return

        method = scope.get("method")
        req_headers = {
            k.decode().lower(): v.decode() for k, v in scope.get("headers", [])
        }
        session = req_headers.get("mcp-session-id") or "(none)"
        status_holder = {"status": None}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_holder["status"] = message.get("status")
            await send(message)

        if method == "POST":
            # Drenar el body para inspeccionar el JSON-RPC method sin consumirlo
            # para la app downstream (se reinyecta vía receive_replay).
            chunks: list[bytes] = []
            trailing = None
            while True:
                msg = await receive()
                if msg["type"] == "http.request":
                    chunks.append(msg.get("body", b""))
                    if not msg.get("more", False):
                        break
                else:  # http.disconnect u otro; lo guardamos para replay
                    trailing = msg
                    break
            body = b"".join(chunks)

            rpc_method = None
            rpc_id = None
            try:
                raw = json.loads(body)
                rpc_method = raw.get("method")
                rpc_id = raw.get("id")
            except Exception:
                rpc_method = f"<unparseable {len(body)}b>"
                rpc_id = "-"

            replayed = {"done": False}

            async def receive_replay():
                if not replayed["done"]:
                    replayed["done"] = True
                    return {"type": "http.request", "body": body, "more": False}
                if trailing is not None:
                    return trailing
                return await receive()

            mcp_request_logger.info(
                "[MCP-IN] POST session=%s rpc.method=%s rpc.id=%s body=%db",
                session,
                rpc_method,
                rpc_id,
                len(body),
            )
            await self.app(scope, receive_replay, send_wrapper)
            mcp_request_logger.info(
                "[MCP-OUT] POST session=%s rpc.method=%s -> %s",
                session,
                rpc_method,
                status_holder["status"],
            )
        else:
            mcp_request_logger.info("[MCP-IN] %s session=%s", method, session)
            await self.app(scope, receive, send_wrapper)
            mcp_request_logger.info(
                "[MCP-OUT] %s session=%s -> %s",
                method,
                session,
                status_holder["status"],
            )


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
    app.add_middleware(McpRequestLoggingMiddleware)

    # Asegurar que el tráfico MCP se registra aunque el root logger esté más callado.
    if not mcp_request_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
        )
        mcp_request_logger.addHandler(handler)
    mcp_request_logger.setLevel(logging.INFO)
    mcp_request_logger.propagate = False
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
    app.include_router(push.router)
    # Servidor MCP remoto en `/mcp` (Streamable HTTP) con puerta Bearer (issue 05).
    app.mount("/mcp", mcp_asgi)
    return app


app = create_app()
