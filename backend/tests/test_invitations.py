"""Tests para el flujo de invitación de Miembros a una Familia.

Clerk es el backend de invitaciones (Organizations). El router
`/invitations` envuelve las llamadas al SDK de Clerk y las expone
al frontend con la autenticación ya resuelta por `family_session`.

Los tests sustituyen la frontera de Clerk (el SDK) para no depender
de la red; el resto del pipeline (auth, materialización, RLS) es real.
"""

from unittest.mock import MagicMock, patch

from httpx import AsyncClient


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


def _clerk_invitation(
    inv_id: str = "inv_test",
    email: str = "abuela@example.com",
    status: str = "pending",
    org_id: str = "org_inv",
) -> MagicMock:
    inv = MagicMock()
    inv.id = inv_id
    inv.email_address = email
    inv.role = "org:member"
    inv.status = status
    inv.created_at = 1718000000000
    inv.organization_id = org_id
    return inv


# ---------------------------------------------------------------------------
# POST /invitations — crear una invitación
# ---------------------------------------------------------------------------


@patch("app.api.invitations.get_clerk")
async def test_create_invitation(
    mock_get_clerk: MagicMock,
    auth_client: AsyncClient,
    identity: dict,
) -> None:
    _as(identity, "org_inv", "user_inv_1")
    clerk = MagicMock()
    clerk.organization_invitations.create.return_value = _clerk_invitation()
    mock_get_clerk.return_value = clerk

    resp = await auth_client.post(
        "/invitations", json={"email_address": "abuela@example.com"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["email_address"] == "abuela@example.com"
    assert body["status"] == "pending"

    clerk.organization_invitations.create.assert_called_once()
    call_kwargs = clerk.organization_invitations.create.call_args.kwargs
    assert call_kwargs["organization_id"] == "org_inv"
    assert call_kwargs["email_address"] == "abuela@example.com"


@patch("app.api.invitations.get_clerk")
async def test_create_invitation_requires_family(
    mock_get_clerk: MagicMock,
    auth_client: AsyncClient,
    identity: dict,
) -> None:
    identity.clear()
    identity.update({"sub": "user_no_org_inv"})
    resp = await auth_client.post(
        "/invitations", json={"email_address": "abuela@example.com"}
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /invitations — listar invitaciones pendientes
# ---------------------------------------------------------------------------


@patch("app.api.invitations.get_clerk")
async def test_list_invitations(
    mock_get_clerk: MagicMock,
    auth_client: AsyncClient,
    identity: dict,
) -> None:
    _as(identity, "org_inv_list", "user_inv_list_1")
    inv = _clerk_invitation(org_id="org_inv_list")
    clerk = MagicMock()
    result = MagicMock()
    result.data = [inv]
    clerk.organization_invitations.list.return_value = result
    mock_get_clerk.return_value = clerk

    resp = await auth_client.get("/invitations")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["email_address"] == "abuela@example.com"
    assert body[0]["status"] == "pending"


# ---------------------------------------------------------------------------
# DELETE /invitations/:id — revocar una invitación
# ---------------------------------------------------------------------------


@patch("app.api.invitations.get_clerk")
async def test_revoke_invitation(
    mock_get_clerk: MagicMock,
    auth_client: AsyncClient,
    identity: dict,
) -> None:
    _as(identity, "org_inv_rev", "user_inv_rev_1")
    clerk = MagicMock()
    revoked = _clerk_invitation(status="revoked", org_id="org_inv_rev")
    clerk.organization_invitations.revoke.return_value = revoked
    mock_get_clerk.return_value = clerk

    resp = await auth_client.delete("/invitations/inv_test")
    assert resp.status_code == 204

    clerk.organization_invitations.revoke.assert_called_once()
    call_kwargs = clerk.organization_invitations.revoke.call_args.kwargs
    assert call_kwargs["organization_id"] == "org_inv_rev"
    assert call_kwargs["invitation_id"] == "inv_test"


# ---------------------------------------------------------------------------
# AC3: un nuevo Miembro accede a los datos de su Familia y solo de esa
# ---------------------------------------------------------------------------


async def test_new_member_accesses_family_data_and_rls_isolates(
    auth_client: AsyncClient,
    identity: dict,
) -> None:
    """Simula que un Miembro existente crea un Hijo, y un nuevo Miembro
    (que aceptó la invitación) puede ver ese Hijo. Un Miembro de otra
    Familia no lo ve."""

    # Miembro original crea un Hijo en la Familia.
    _as(identity, "org_join", "user_join_original")
    resp = await auth_client.post(
        "/children", json={"name": "Hijo compartido", "birth_date": "2021-06-01"}
    )
    assert resp.status_code == 201

    # Nuevo Miembro (simulado: distinto user_id, misma Familia).
    _as(identity, "org_join", "user_join_new")
    children = (await auth_client.get("/children")).json()
    assert any(c["name"] == "Hijo compartido" for c in children)

    # También ve a los dos Miembros de la Familia.
    members = (await auth_client.get("/members")).json()
    member_ids = {m["id"] for m in members}
    assert "user_join_original" in member_ids
    assert "user_join_new" in member_ids

    # Otra Familia no ve nada de org_join.
    _as(identity, "org_join_other", "user_join_other")
    assert (await auth_client.get("/children")).json() == []
    other_members = (await auth_client.get("/members")).json()
    assert all(m["family_id"] != "org_join" for m in other_members)
