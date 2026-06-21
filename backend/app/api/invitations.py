"""Invitaciones de Miembros a una Familia, delegadas a Clerk Organizations.

Los endpoints envuelven el SDK de Clerk (`organization_invitations`) y los
exponen con la autenticación y la Familia ya resueltas por `family_session`.
No almacenamos invitaciones en la base de datos propia: Clerk es la fuente
de verdad. Cuando la persona acepta la invitación y hace su primera petición,
`family_session` la materializa como Miembro (upsert en `families`/`members`).
"""

from fastapi import APIRouter, Depends, status

from ..auth import get_clerk
from ..models import InvitationCreate, InvitationOut
from ..tenancy import FamilyScope, family_session

router = APIRouter(tags=["invitations"])


@router.post("/invitations", status_code=status.HTTP_201_CREATED)
async def create_invitation(
    body: InvitationCreate,
    scope: FamilyScope = Depends(family_session),
) -> InvitationOut:
    """Envía una invitación por email a la Familia del Miembro autenticado."""
    clerk = get_clerk()
    inv = clerk.organization_invitations.create(
        organization_id=scope.family_id,
        email_address=body.email_address,
        role="org:member",
        inviter_user_id=scope.member_id,
    )
    return InvitationOut(
        id=inv.id,
        email_address=inv.email_address,
        role=inv.role,
        status=inv.status,
        created_at=inv.created_at,
    )


@router.get("/invitations")
async def list_invitations(
    scope: FamilyScope = Depends(family_session),
) -> list[InvitationOut]:
    """Lista las invitaciones pendientes de la Familia autenticada."""
    clerk = get_clerk()
    result = clerk.organization_invitations.list(
        organization_id=scope.family_id,
        status="pending",
    )
    return [
        InvitationOut(
            id=inv.id,
            email_address=inv.email_address,
            role=inv.role,
            status=inv.status,
            created_at=inv.created_at,
        )
        for inv in (result.data or [])
    ]


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_invitation(
    invitation_id: str,
    scope: FamilyScope = Depends(family_session),
) -> None:
    """Revoca una invitación pendiente de la Familia autenticada."""
    clerk = get_clerk()
    clerk.organization_invitations.revoke(
        organization_id=scope.family_id,
        invitation_id=invitation_id,
        requesting_user_id=scope.member_id,
    )
