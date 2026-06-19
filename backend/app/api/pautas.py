"""Router REST para Pautas (tratamientos): iniciar, listar, detalle, finalizar.

Convenciones:
- Cross-Hijo: `/pautas` lista todas las Pautas de la Familia.
- Filtros por query params: `status` (active/finished) y `child_id`.
- `ends_at` y `day_number` son calculados, no persistidos.
- Lazy finish: si `now >= ends_at`, se marca `finished` al consultar.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..models import (
    Administration,
    AdministrationOut,
    Member,
    Pauta,
    PautaCreate,
    PautaOut,
)
from ..tenancy import current_family_id, current_member_id, family_session

router = APIRouter(tags=["pautas"])


async def _to_out(pauta: Pauta, session: AsyncSession) -> PautaOut:
    """Convierte un modelo Pauta a PautaOut con campos calculados.

    Calcula `next_dose_at` (última Administración + interval) y
    `todays_administrations` (Administraciones de hoy).
    """
    now = datetime.now(UTC)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Última Administración → next_dose_at
    last_stmt = (
        select(Administration)
        .where(Administration.pauta_id == pauta.id)
        .order_by(Administration.administered_at.desc())
        .limit(1)
    )
    last_result = await session.execute(last_stmt)
    last_admin = last_result.scalars().first()

    next_dose_at: datetime | None = None
    if pauta.status == "active":
        if last_admin is not None:
            next_dose_at = last_admin.administered_at + timedelta(
                hours=pauta.interval_hours
            )
        else:
            next_dose_at = pauta.started_at + timedelta(hours=pauta.interval_hours)

    # Administraciones de hoy
    today_stmt = (
        select(Administration)
        .where(
            Administration.pauta_id == pauta.id,
            Administration.administered_at >= today_start,
        )
        .order_by(Administration.administered_at.asc())
    )
    today_result = await session.execute(today_stmt)
    today_admins = list(today_result.scalars().all())

    todays_out: list[AdministrationOut] = []
    for a in today_admins:
        member = await session.get(Member, a.administered_by)
        todays_out.append(
            AdministrationOut(
                id=a.id,
                pauta_id=a.pauta_id,
                administered_at=a.administered_at,
                administered_by=a.administered_by,
                member_name=member.display_name if member else None,
                created_at=a.created_at,
            )
        )

    return PautaOut(
        id=pauta.id,
        family_id=pauta.family_id,
        child_id=pauta.child_id,
        medication=pauta.medication,
        dose=pauta.dose,
        interval_hours=pauta.interval_hours,
        duration_days=pauta.duration_days,
        started_at=pauta.started_at,
        ends_at=pauta.ends_at,
        status=pauta.status,
        health_visit_id=pauta.health_visit_id,
        created_by=pauta.created_by,
        created_at=pauta.created_at,
        day_number=pauta.day_number,
        next_dose_at=next_dose_at,
        todays_administrations=todays_out,
    )


async def _lazy_finish(pauta: Pauta, session: AsyncSession) -> Pauta:
    """Finalización automática lazy: si `now >= ends_at`, marca finished."""
    if pauta.status == "active" and pauta.is_expired:
        pauta.status = "finished"
        session.add(pauta)
        await session.flush()
        await session.refresh(pauta)
    return pauta


async def _get_owned_pauta(session: AsyncSession, pauta_id: uuid.UUID) -> Pauta:
    """Carga una Pauta de la Familia activa o lanza 404."""
    pauta = await session.get(Pauta, pauta_id)
    if pauta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pauta no encontrada"
        )
    return pauta


@router.post("/pautas", status_code=status.HTTP_201_CREATED)
async def create_pauta(
    data: PautaCreate,
    family_id: str = Depends(current_family_id),
    member_id: str = Depends(current_member_id),
    session: AsyncSession = Depends(family_session),
) -> PautaOut:
    """Inicia una nueva Pauta para un Hijo de la Familia autenticada."""
    now = datetime.now(UTC)
    pauta = Pauta(
        family_id=family_id,
        child_id=data.child_id,
        medication=data.medication,
        dose=data.dose,
        interval_hours=data.interval_hours,
        duration_days=data.duration_days,
        started_at=now,
        status="active",
        health_visit_id=data.health_visit_id,
        created_by=member_id,
        created_at=now,
    )
    session.add(pauta)
    await session.flush()
    await session.refresh(pauta)
    return await _to_out(pauta, session)


@router.get("/pautas")
async def list_pautas(
    session: AsyncSession = Depends(family_session),
    status_filter: str | None = Query(None, alias="status"),
    child_id: uuid.UUID | None = Query(None),
) -> list[PautaOut]:
    """Lista las Pautas de la Familia, con filtros opcionales por status/child_id."""
    stmt = select(Pauta)
    if child_id:
        stmt = stmt.where(Pauta.child_id == child_id)
    stmt = stmt.order_by(Pauta.started_at.desc())
    result = await session.execute(stmt)
    pautas = list(result.scalars().all())

    out: list[PautaOut] = []
    for p in pautas:
        p = await _lazy_finish(p, session)
        # El filtrado por status se aplica tras _lazy_finish: una Pauta caducada
        # se marca finished aquí mismo, así ?status=active no la devuelve como activa.
        if status_filter and p.status != status_filter:
            continue
        out.append(await _to_out(p, session))
    return out


@router.get("/pautas/{pauta_id}")
async def get_pauta(
    pauta_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> PautaOut:
    """Detalle de una Pauta con campos calculados."""
    pauta = await _get_owned_pauta(session, pauta_id)
    pauta = await _lazy_finish(pauta, session)
    return await _to_out(pauta, session)


@router.post("/pautas/{pauta_id}/finish")
async def finish_pauta(
    pauta_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> PautaOut:
    """Finaliza manualmente una Pauta activa."""
    pauta = await _get_owned_pauta(session, pauta_id)
    if pauta.status == "finished":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La Pauta ya está finalizada",
        )
    pauta.status = "finished"
    session.add(pauta)
    await session.flush()
    await session.refresh(pauta)
    return await _to_out(pauta, session)
