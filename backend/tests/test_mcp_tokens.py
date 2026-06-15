import base64
import hashlib

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_generate_token_returns_plaintext_once_and_stores_hash(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    _as(identity, "org_tk1", "user_tk1")

    resp = await auth_client.post("/mcp-tokens")
    assert resp.status_code == 201
    body = resp.json()
    token = body["token"]
    token_id = body["id"]
    assert token  # valor en claro, no vacío
    assert body["created_at"]

    # Alta entropía: la parte base64url (sin prefijo) decodifica a ≥32 bytes.
    raw = token.removeprefix("tdm_live_")
    decoded = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    assert len(decoded) >= 32

    # En BD queda SOLO el hash: el valor en claro no aparece, y lo guardado es
    # exactamente su sha256.
    async with app_session.begin():
        await app_session.execute(
            text("SELECT set_config('app.current_family_id', :v, true)"),
            {"v": "org_tk1"},
        )
        row = (
            await app_session.execute(
                text("SELECT token_hash FROM mcp_tokens WHERE id::text = :id"),
                {"id": token_id},
            )
        ).one()
    stored_hash = row.token_hash
    assert stored_hash != token
    assert stored_hash == hashlib.sha256(token.encode()).hexdigest()


async def test_list_tokens_exposes_no_secret(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_tk2", "user_tk2")
    created = (await auth_client.post("/mcp-tokens")).json()
    token = created["token"]

    listed = (await auth_client.get("/mcp-tokens")).json()
    assert len(listed) == 1
    entry = listed[0]
    assert entry["id"] == created["id"]
    assert entry["created_at"]
    assert entry["revoked_at"] is None
    # El listado nunca expone el valor en claro ni el hash.
    assert "token" not in entry
    assert "token_hash" not in entry
    assert token not in repr(entry)


async def test_revoke_token_marks_revoked(
    auth_client: AsyncClient, identity: dict
) -> None:
    _as(identity, "org_tk3", "user_tk3")
    token_id = (await auth_client.post("/mcp-tokens")).json()["id"]

    deleted = await auth_client.delete(f"/mcp-tokens/{token_id}")
    assert deleted.status_code == 204

    listed = (await auth_client.get("/mcp-tokens")).json()
    assert len(listed) == 1
    assert listed[0]["id"] == token_id
    assert listed[0]["revoked_at"] is not None


async def test_member_scoping_within_same_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    # Miembro A genera un token en la Familia compartida.
    _as(identity, "org_shared", "user_a")
    token_id = (await auth_client.post("/mcp-tokens")).json()["id"]

    # Miembro B, de la MISMA Familia, no lo ve en su listado...
    _as(identity, "org_shared", "user_b")
    assert (await auth_client.get("/mcp-tokens")).json() == []

    # ...ni puede revocarlo (404: se comporta como inexistente).
    assert (await auth_client.delete(f"/mcp-tokens/{token_id}")).status_code == 404

    # El token de A sigue activo e intacto.
    _as(identity, "org_shared", "user_a")
    listed = (await auth_client.get("/mcp-tokens")).json()
    assert [t["id"] for t in listed] == [token_id]
    assert listed[0]["revoked_at"] is None


async def test_family_isolation_via_rls(
    auth_client: AsyncClient, identity: dict
) -> None:
    # La Familia A genera un token.
    _as(identity, "org_fa", "user_fa")
    token_id = (await auth_client.post("/mcp-tokens")).json()["id"]

    # La Familia B no lo ve en su listado ni puede revocarlo (RLS → 404).
    _as(identity, "org_fb", "user_fb")
    assert (await auth_client.get("/mcp-tokens")).json() == []
    assert (await auth_client.delete(f"/mcp-tokens/{token_id}")).status_code == 404

    # El token de A sigue activo.
    _as(identity, "org_fa", "user_fa")
    listed = (await auth_client.get("/mcp-tokens")).json()
    assert [t["id"] for t in listed] == [token_id]


async def test_create_token_requires_family(
    auth_client: AsyncClient, identity: dict
) -> None:
    # Autenticado pero sin Organización activa: no hay Familia donde crear.
    identity.clear()
    identity.update({"sub": "user_no_org_token"})
    resp = await auth_client.post("/mcp-tokens")
    assert resp.status_code == 403
