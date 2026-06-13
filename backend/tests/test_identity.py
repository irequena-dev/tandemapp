from httpx import AsyncClient


async def test_whoami_requires_auth(client: AsyncClient) -> None:
    # Sin cabecera Authorization no hay sesión válida de Clerk.
    resp = await client.get("/whoami")
    assert resp.status_code == 401


async def test_whoami_rejects_garbage_token(client: AsyncClient) -> None:
    resp = await client.get(
        "/whoami", headers={"Authorization": "Bearer not-a-real-token"}
    )
    assert resp.status_code == 401
