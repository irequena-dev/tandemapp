"""Router REST para Administraciones (dosis registradas de una Pauta).

Endpoints anidados bajo `/pautas/{pauta_id}/administrations`.
- GET: listar Administraciones de una Pauta
- POST: registrar nueva (con guarda de duplicado ~15 min)
- PATCH: corregir `administered_at`
- DELETE: borrar (recalcula `next_dose_at` implícitamente)

La guarda de duplicado devuelve la Administración existente con 200 (no 201)
si hay otra dentro de la ventana corta configurable.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import (
    Administration,
    AdministrationCreate,
    AdministrationOut,
    AdministrationUpdate,
    Member,
    Pauta,
)
from ..tenancy import current_family_id, current_member_id, family_session

router = APIRouter(tags=["administrations"])

# Ventana de guarda de duplicado (en minutos). Configurable.
DUPLICATE_GUARD_MINUTES = 15


async def _get_owned_pauta(session: AsyncSession, pauta_id: uuid.UUID) -> Pauta:
    pauta = await session.get(Pauta, pauta_id)
    if pauta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pauta no encontrada"
        )
    return pauta


async def _get_owned_admin(
    session: AsyncSession, pauta_id: uuid.UUID, admin_id: uuid.UUID
) -> Administration:
    admin = await session.get(Administration, admin_id)
    if admin is None or admin.pauta_id != pauta_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Administración no encontrada",
        )
    return admin


async def _to_out(session: AsyncSession, admin: Administration) -> AdministrationOut:
    member = await session.get(Member, admin.administered_by)
    return AdministrationOut(
        id=admin.id,
        pauta_id=admin.pauta_id,
        administered_at=admin.administered_at,
        administered_by=admin.administered_by,
        member_name=member.display_name if member else None,
        created_at=admin.created_at,
    )


@router.get("/pautas/{pauta_id}/administrations")
async def list_administrations(
    pauta_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> list[AdministrationOut]:
    """Lista las Administraciones de una Pauta, más recientes primero."""
    await _get_owned_pauta(session, pauta_id)
    stmt = (
        select(Administration)
        .where(Administration.pauta_id == pauta_id)
        .order_by(Administration.administered_at.desc())
    )
    result = await session.execute(stmt)
    admins = list(result.scalars().all())
    return [await _to_out(session, a) for a in admins]


@router.post("/pautas/{pauta_id}/administrations")
async def create_administration(
    pauta_id: uuid.UUID,
    data: AdministrationCreate,
    response: Response,
    family_id: str = Depends(current_family_id),
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> AdministrationOut:
    """Registra una Administración con guarda de duplicado.

    Si existe otra Administración de la misma Pauta dentro de la ventana corta
    (~15 min), devuelve la existente con 200 (no 201).
    """
    pauta = await _get_owned_pauta(session, pauta_id)
    if pauta.status == "finished":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede registrar una Administración en una Pauta finalizada",
        )

    administered_at = data.administered_at or datetime.now(UTC)

    # Guarda de duplicado: buscar Administraciones dentro de la ventana
    window_start = administered_at - timedelta(minutes=DUPLICATE_GUARD_MINUTES)
    window_end = administered_at + timedelta(minutes=DUPLICATE_GUARD_MINUTES)
    stmt = (
        select(Administration)
        .where(
            Administration.pauta_id == pauta_id,
            Administration.administered_at >= window_start,
            Administration.administered_at <= window_end,
        )
        .order_by(Administration.administered_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    existing = result.scalars().first()

    if existing is not None:
        response.status_code = status.HTTP_200_OK
        return await _to_out(session, existing)

    # No hay duplicado → crear
    admin = Administration(
        family_id=family_id,
        pauta_id=pauta_id,
        administered_at=administered_at,
        administered_by=member_id,
    )
    session.add(admin)
    await session.flush()
    await session.refresh(admin)
    response.status_code = status.HTTP_201_CREATED
    return await _to_out(session, admin)


@router.patch("/pautas/{pauta_id}/administrations/{admin_id}")
async def update_administration(
    pauta_id: uuid.UUID,
    admin_id: uuid.UUID,
    data: AdministrationUpdate,
    session: AsyncSession = Depends(family_session),
) -> AdministrationOut:
    """Corrige una Administración (p. ej. la hora)."""
    admin = await _get_owned_admin(session, pauta_id, admin_id)
    if data.administered_at is not None:
        admin.administered_at = data.administered_at
    session.add(admin)
    await session.flush()
    await session.refresh(admin)
    return await _to_out(session, admin)


@router.delete(
    "/pautas/{pauta_id}/administrations/{admin_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_administration(
    pauta_id: uuid.UUID,
    admin_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> None:
    """Borra una Administración (la siguiente toma se recalcula implícitamente)."""
    admin = await _get_owned_admin(session, pauta_id, admin_id)
    await session.delete(admin)
    await session.flush()
