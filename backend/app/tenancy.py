"""Aislamiento multi-inquilino: una sola puerta para fijar la Familia activa.

Toda transacción que toque datos de dominio pasa por `family_session`, que
materializa la identidad de Clerk en `families`/`members` y fija la variable de
sesión `app.current_family_id` (SET LOCAL). PostgreSQL aplica RLS sobre esa
variable como red de seguridad. Ningún handler fija la variable ad hoc.
"""

from collections.abc import AsyncIterator

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import require_auth
from .database import get_sessionmaker

# Variable de sesión que fija la Familia activa por transacción (SET LOCAL).
FAMILY_VAR = "app.current_family_id"


def family_id_from_claims(claims: dict) -> str | None:
    """`org_id` de Clerk (≡ `family_id`), tolerando el formato v1 y v2."""
    org_id = claims.get("org_id")
    if not org_id:
        org_id = (claims.get("o") or {}).get("id")
    return org_id


def family_slug_from_claims(claims: dict) -> str | None:
    o = claims.get("o") or {}
    return claims.get("org_slug") or o.get("slg") or o.get("slug")


def member_display_name_from_claims(claims: dict) -> str | None:
    name = claims.get("name")
    if name:
        return name
    parts = [claims.get("given_name"), claims.get("family_name")]
    full = " ".join(p for p in parts if p)
    return full or None


async def _materialize(session: AsyncSession, claims: dict, family_id: str) -> None:
    """Espeja la Org y el usuario de Clerk en `families` y `members` (upsert)."""
    await session.execute(
        text(
            "INSERT INTO families (id, slug, name) VALUES (:id, :slug, :name) "
            "ON CONFLICT (id) DO UPDATE "
            "SET slug = COALESCE(EXCLUDED.slug, families.slug)"
        ),
        {
            "id": family_id,
            "slug": family_slug_from_claims(claims),
            "name": family_slug_from_claims(claims),
        },
    )
    await session.execute(
        text(
            "INSERT INTO members (id, family_id, display_name) "
            "VALUES (:id, :family_id, :name) "
            "ON CONFLICT (id) DO UPDATE SET "
            "family_id = EXCLUDED.family_id, "
            "display_name = COALESCE(EXCLUDED.display_name, members.display_name)"
        ),
        {
            "id": claims["sub"],
            "family_id": family_id,
            "name": member_display_name_from_claims(claims),
        },
    )


async def family_session(
    claims: dict = Depends(require_auth),
) -> AsyncIterator[AsyncSession]:
    """Sesión acotada a la Familia autenticada, con identidad materializada.

    Lanza 403 si el Miembro no tiene una Familia (Organización) activa.
    """
    family_id = family_id_from_claims(claims)
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El Miembro no tiene una Familia activa",
        )

    async with get_sessionmaker()() as session:
        async with session.begin():
            # Fijar la Familia ANTES de cualquier escritura: las políticas RLS
            # (WITH CHECK) validan contra esta variable.
            await session.execute(
                text("SELECT set_config(:key, :value, true)"),
                {"key": FAMILY_VAR, "value": family_id},
            )
            await _materialize(session, claims, family_id)
            yield session
