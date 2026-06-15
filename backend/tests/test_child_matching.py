from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.mcp.child_matching import ChildMatchError, resolve_child_by_name
from app.models import Child


def _as(identity: dict, org_id: str, user_id: str) -> None:
    """Impersona a un Miembro `user_id` de la Familia `org_id`."""
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def test_resolve_exact_match_returns_child(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    # Sembrar un Hijo "Mara" en la Familia org_m1 vía REST (transacción propia).
    _as(identity, "org_m1", "user_m1_1")
    created = (
        await auth_client.post(
            "/children", json={"name": "Mara", "birth_date": "2020-05-01"}
        )
    ).json()
    child_id = created["id"]

    # Resolver sobre app_session con la variable de Familia fijada (SET LOCAL).
    async with app_session.begin():
        await app_session.execute(
            text("SELECT set_config('app.current_family_id', :v, true)"),
            {"v": "org_m1"},
        )
        result = await resolve_child_by_name(app_session, "Mara")

    assert isinstance(result, Child)
    assert str(result.id) == child_id
    assert result.name == "Mara"


async def test_resolve_case_insensitive_returns_same_child(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    _as(identity, "org_m2", "user_m2_1")
    created = (
        await auth_client.post(
            "/children", json={"name": "Mara", "birth_date": "2020-05-01"}
        )
    ).json()
    child_id = created["id"]

    for variant in ("MARA", "mara"):
        async with app_session.begin():
            await app_session.execute(
                text("SELECT set_config('app.current_family_id', :v, true)"),
                {"v": "org_m2"},
            )
            result = await resolve_child_by_name(app_session, variant)

        assert isinstance(result, Child)
        assert str(result.id) == child_id
        assert result.name == "Mara"


async def test_resolve_no_match_returns_not_found_with_valid_children(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    _as(identity, "org_m3", "user_m3_1")
    # La Familia tiene a Lúa y Bilú; se pide un nombre inexistente.
    await auth_client.post(
        "/children", json={"name": "Lúa", "birth_date": "2019-03-02"}
    )
    await auth_client.post(
        "/children", json={"name": "Bilú", "birth_date": "2021-07-19"}
    )

    async with app_session.begin():
        await app_session.execute(
            text("SELECT set_config('app.current_family_id', :v, true)"),
            {"v": "org_m3"},
        )
        result = await resolve_child_by_name(app_session, "Inexistente")

    assert isinstance(result, ChildMatchError)
    assert result.reason == "not_found"
    assert [c.name for c in result.valid_children] == ["Lúa", "Bilú"]


async def test_resolve_ambiguous_returns_ambiguous_with_valid_children(
    auth_client: AsyncClient, identity: dict, app_session: AsyncSession
) -> None:
    _as(identity, "org_m4", "user_m4_1")
    # Dos Hijos con el mismo nombre (distinta fecha) en la misma Familia.
    await auth_client.post(
        "/children", json={"name": "Alex", "birth_date": "2018-01-01"}
    )
    await auth_client.post(
        "/children", json={"name": "alex", "birth_date": "2020-06-06"}
    )

    async with app_session.begin():
        await app_session.execute(
            text("SELECT set_config('app.current_family_id', :v, true)"),
            {"v": "org_m4"},
        )
        result = await resolve_child_by_name(app_session, "ALEX")

    assert isinstance(result, ChildMatchError)
    assert result.reason == "ambiguous"
    # Ambos Hijos comparten el nombre (case-insensitive) → aparecen en la lista.
    assert [c.name for c in result.valid_children] == ["Alex", "alex"]
