"""Resolución del token MCP a (Miembro, Familia) — issue 05 (auth bootstrap).

El servidor MCP recibe `Authorization: Bearer <token>` y debe resolver el token
a su (member_id, family_id) sin conocer la Familia de antemano (la variable de
sesión RLS aún NO está fijada). Por eso el lookup pasa por `resolve_mcp_token`,
función `SECURITY DEFINER` de un superuser → bypasa RLS y puede leer
`mcp_tokens` de cualquier Familia. Es exactamente el bootstrap de autenticación.
"""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.auth import extract_bearer, resolve_token


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_valid_token_resolves_to_member_and_family(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    _as(identity, "org_auth_a", "user_auth_a")

    resp = await auth_client.post("/mcp-tokens")
    assert resp.status_code == 201
    token = resp.json()["token"]

    assert await resolve_token(app_session, token) == ("user_auth_a", "org_auth_a")


async def test_revoked_token_does_not_resolve(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    _as(identity, "org_auth_b", "user_auth_b")

    created = (await auth_client.post("/mcp-tokens")).json()
    token = created["token"]
    token_id = created["id"]

    deleted = await auth_client.delete(f"/mcp-tokens/{token_id}")
    assert deleted.status_code == 204

    assert await resolve_token(app_session, token) is None


async def test_unknown_token_does_not_resolve(app_session: AsyncSession) -> None:
    assert await resolve_token(app_session, "tdm_live_unknown") is None


async def test_empty_presented_does_not_resolve(app_session: AsyncSession) -> None:
    assert await resolve_token(app_session, "") is None


def test_extract_bearer_parses_scheme_and_token() -> None:
    assert extract_bearer({"authorization": "Bearer abc"}) == "abc"


def test_extract_bearer_is_case_insensitive_on_header_name() -> None:
    assert extract_bearer({"Authorization": "Bearer abc"}) == "abc"


def test_extract_bearer_returns_none_when_only_scheme() -> None:
    assert extract_bearer({"authorization": "Bearer"}) is None


def test_extract_bearer_returns_none_when_header_missing() -> None:
    assert extract_bearer({}) is None


def test_extract_bearer_returns_none_for_wrong_scheme() -> None:
    assert extract_bearer({"authorization": "Basic xyz"}) is None
