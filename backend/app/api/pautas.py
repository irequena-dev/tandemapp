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

from ..models import Pauta, PautaCreate, PautaOut
from ..tenancy import current_family_id, current_member_id, family_session

router = APIRouter(tags=["pautas"])


def _compute_next_dose_at(pauta: Pauta) -> datetime | None:
    """Calcula la siguiente toma: null si finalizada, started_at + interval si activa.

    Cuando existan Administraciones, será última_admin + interval. Hasta entonces,
    la primera toma es started_at + interval_hours.
    """
    if pauta.status == "finished":
        return None
    candidate = pauta.started_at + timedelta(hours=pauta.interval_hours)
    if candidate >= pauta.ends_at:
        return None
    return candidate


def _to_out(pauta: Pauta) -> PautaOut:
    """Convierte un modelo Pauta a PautaOut con campos calculados."""
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
        next_dose_at=_compute_next_dose_at(pauta),
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
    return _to_out(pauta)


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
        if status_filter and p.status != status_filter:
            continue
        out.append(_to_out(p))
    return out


@router.get("/pautas/{pauta_id}")
async def get_pauta(
    pauta_id: uuid.UUID,
    session: AsyncSession = Depends(family_session),
) -> PautaOut:
    """Detalle de una Pauta con campos calculados."""
    pauta = await _get_owned_pauta(session, pauta_id)
    pauta = await _lazy_finish(pauta, session)
    return _to_out(pauta)


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
    return _to_out(pauta)
