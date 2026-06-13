import pytest
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_members_isolated_between_families(
    auth_client: AsyncClient, identity: dict
) -> None:
    # Dos Familias distintas, cada una con su Miembro.
    _as(identity, "org_iso_a", "user_iso_a1")
    resp_a = await auth_client.get("/members")
    assert resp_a.status_code == 200

    _as(identity, "org_iso_b", "user_iso_b1")
    resp_b = await auth_client.get("/members")
    assert resp_b.status_code == 200

    # Cada Familia solo ve a su propio Miembro, nunca al de la otra.
    ids_a = {m["id"] for m in resp_a.json()}
    ids_b = {m["id"] for m in resp_b.json()}
    assert ids_a == {"user_iso_a1"}
    assert ids_b == {"user_iso_b1"}


async def test_materializes_clerk_identity(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    _as(identity, "org_mat", "user_mat_1")
    resp = await auth_client.get("/members")
    assert resp.status_code == 200
    assert [m["id"] for m in resp.json()] == ["user_mat_1"]

    # La Familia se ha persistido (visible al fijar su propia variable).
    async with app_session.begin():
        await app_session.execute(
            text("SELECT set_config('app.current_family_id', :v, true)"),
            {"v": "org_mat"},
        )
        rows = (
            (await app_session.execute(text("SELECT id FROM families"))).scalars().all()
        )
    assert "org_mat" in rows


async def test_member_without_family_is_forbidden(
    auth_client: AsyncClient, identity: dict
) -> None:
    # Autenticado pero sin Organización activa: no hay Familia que aislar.
    identity.clear()
    identity.update({"sub": "user_no_org"})
    resp = await auth_client.get("/members")
    assert resp.status_code == 403


async def test_rls_denies_select_when_family_var_unset(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    # Sembrar una Familia real vía la costura de request.
    _as(identity, "org_unset", "user_unset_1")
    assert (await auth_client.get("/members")).status_code == 200

    # Sin fijar la variable de Familia, RLS oculta todas las filas.
    async with app_session.begin():
        count = await app_session.scalar(text("SELECT count(*) FROM families"))
    assert count == 0


async def test_rls_denies_insert_when_family_var_unset(
    app_session: AsyncSession,
) -> None:
    # Sin variable de Familia, el WITH CHECK de RLS rechaza la escritura.
    with pytest.raises(DBAPIError):
        async with app_session.begin():
            await app_session.execute(
                text("INSERT INTO families (id) VALUES ('org_denied')")
            )


async def test_rls_denies_writing_into_another_family(
    app_session: AsyncSession,
) -> None:
    # Con la Familia A fijada, no se puede insertar nada de la Familia B.
    with pytest.raises(DBAPIError):
        async with app_session.begin():
            await app_session.execute(
                text("SELECT set_config('app.current_family_id', 'org_A', true)")
            )
            await app_session.execute(
                text("INSERT INTO families (id) VALUES ('org_B')")
            )
