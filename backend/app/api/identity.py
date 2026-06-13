from fastapi import APIRouter, Depends

from ..auth import require_auth

router = APIRouter(tags=["identity"])


@router.get("/whoami")
def whoami(claims: dict = Depends(require_auth)) -> dict:
    """Devuelve el Miembro y la Familia (Organización de Clerk) del contexto.

    `family` es None si el Miembro todavía no tiene una Organización activa.
    """
    # Claims de organización: formato v1 (org_id/org_role/org_slug) o v2 (objeto "o").
    org_id = claims.get("org_id")
    org_role = claims.get("org_role")
    org_slug = claims.get("org_slug")

    o = claims.get("o") or {}
    if not org_id and o:
        org_id = o.get("id")
        org_role = o.get("rol") or o.get("role")
        org_slug = o.get("slg") or o.get("slug")

    family = {"org_id": org_id, "role": org_role, "slug": org_slug} if org_id else None
    return {"member_id": claims.get("sub"), "family": family}
