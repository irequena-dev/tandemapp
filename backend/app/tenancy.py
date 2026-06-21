"""Aislamiento multi-inquilino: una sola puerta para fijar la Familia activa.

Toda transacción que toque datos de dominio pasa por `open_family_scope`, que
materializa la identidad de Clerk en `families`/`members` y fija la variable de
sesión `app.current_family_id` (SET LOCAL). PostgreSQL aplica RLS sobre esa
variable como red de seguridad. Ningún handler fija la variable ad hoc.

La misma puerta la usan:
- REST, a través de la dependencia `family_session` (entrega un `FamilyScope`).
- MCP, a través de `tool_session` en `app.mcp.server`.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .auth import require_auth
from .database import get_sessionmaker

# Variable de sesión que fija la Familia activa por transacción (SET LOCAL).
FAMILY_VAR = "app.current_family_id"


@dataclass
class FamilyScope:
    """Una puerta: sesión acotada a la Familia + identidad ya resuelta."""

    session: AsyncSession
    family_id: str
    member_id: str


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


@asynccontextmanager
async def open_family_scope(
    family_id: str, member_id: str, *, claims: dict | None = None
) -> AsyncIterator[FamilyScope]:
    """Abre sesión, fija app.current_family_id (SET LOCAL) y, si hay claims,
    materializa la identidad de Clerk. La ÚNICA implementación del setup RLS."""
    async with get_sessionmaker()() as session:
        async with session.begin():
            await session.execute(
                text("SELECT set_config(:key, :value, true)"),
                {"key": FAMILY_VAR, "value": family_id},
            )
            if claims is not None:
                await _materialize(session, claims, family_id)
            yield FamilyScope(session=session, family_id=family_id, member_id=member_id)


async def family_session(
    claims: dict = Depends(require_auth),
) -> AsyncIterator[FamilyScope]:
    """Sesión acotada a la Familia autenticada, con identidad materializada.

    Lanza 403 si el Miembro no tiene una Familia (Organización) activa.
    Entrega un `FamilyScope` con sesión + identidad ya resueltas.
    """
    family_id = family_id_from_claims(claims)
    if not family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="El Miembro no tiene una Familia activa",
        )
    member_id = claims["sub"]
    async with open_family_scope(family_id, member_id, claims=claims) as scope:
        yield scope
