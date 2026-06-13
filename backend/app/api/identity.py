from fastapi import APIRouter, Depends

from ..auth import require_auth
from ..tenancy import family_id_from_claims, family_slug_from_claims

router = APIRouter(tags=["identity"])


@router.get("/whoami")
def whoami(claims: dict = Depends(require_auth)) -> dict:
    """Devuelve el Miembro y la Familia (Organización de Clerk) del contexto.

    `family` es None si el Miembro todavía no tiene una Organización activa.
    """
    # Claims de organización: formato v1 (org_id/org_role) o v2 (objeto "o").
    org_id = family_id_from_claims(claims)
    o = claims.get("o") or {}
    org_role = claims.get("org_role") or o.get("rol") or o.get("role")

    family = (
        {"org_id": org_id, "role": org_role, "slug": family_slug_from_claims(claims)}
        if org_id
        else None
    )
    return {"member_id": claims.get("sub"), "family": family}
