from functools import lru_cache

import httpx
from clerk_backend_api import AuthenticateRequestOptions, Clerk
from fastapi import HTTPException, Request, status

from .config import get_settings


@lru_cache
def get_clerk() -> Clerk:
    return Clerk(bearer_auth=get_settings().clerk_secret_key)


def require_auth(request: Request) -> dict:
    """Verifica el JWT de Clerk (networkless vía JWKS) y devuelve sus claims.

    Lanza 401 si la petición no corresponde a una sesión válida.
    """
    settings = get_settings()
    clerk = get_clerk()

    httpx_request = httpx.Request(
        method=request.method,
        url=str(request.url),
        headers=dict(request.headers),
    )
    state = clerk.authenticate_request(
        httpx_request,
        AuthenticateRequestOptions(authorized_parties=settings.authorized_parties),
    )
    if not state.is_signed_in:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=state.message or "No autenticado",
        )
    return state.payload or {}
