"""Router REST para Pautas (tratamientos): iniciar, listar, detalle, finalizar.

Adaptador fino sobre `app.pautas_service`: la matemática de próxima toma, la
expiración lazy y el enriquecimiento batch-loaded viven en el módulo de dominio.
Aquí solo se filtra/proyecta.

Convenciones:
- Cross-Hijo: `/pautas` lista todas las Pautas de la Familia.
- Filtros por query params: `status` (active/finished) y `child_id`.
- `ends_at` y `day_number` son calculados, no persistidos.
- Expiración lazy: `expire_due_pautas` se llama UNA vez al inicio de la lectura.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import select

from ..models import (
    AdministrationOut,
    Member,
    Pauta,
    PautaCreate,
    PautaOut,
)
from ..pautas_service import PautaView, expire_due_pautas, load_pauta_views
from ..tenancy import FamilyScope, family_session

router = APIRouter(tags=["pautas"])


def _to_out(view: PautaView) -> PautaOut:
    """Proyección pura de un `PautaView` a `PautaOut`. Sin consultas."""
    pauta = view.pauta
    todays_out = [
        AdministrationOut(
            id=a.id,
            pauta_id=a.pauta_id,
            administered_at=a.administered_at,
            administered_by=a.administered_by,
            member_name=member_name,
            created_at=a.created_at,
        )
        for a, member_name in (
            (av.admin, av.member_name) for av in view.todays_administrations
        )
    ]
    return PautaOut(
        id=pauta.id,
        family_id=pauta.family_id,
        child_id=pauta.child_id,
        member_id=pauta.member_id,
        subject_name=view.subject_name or "…",
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
        next_dose_at=view.next_dose_at,
        todays_administrations=todays_out,
    )


async def _get_owned_pauta(session, pauta_id: uuid.UUID) -> Pauta:
    """Carga una Pauta de la Familia activa o lanza 404."""
    pauta = await session.get(Pauta, pauta_id)
    if pauta is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pauta no encontrada"
        )
    return pauta


async def _enrich_one(scope: FamilyScope, pauta: Pauta) -> PautaOut:
    today = datetime.now(UTC).date()
    views = await load_pauta_views(scope.session, [pauta], today=today, tz=UTC)
    return _to_out(views[0])


@router.post("/pautas", status_code=status.HTTP_201_CREATED)
async def create_pauta(
    data: PautaCreate,
    scope: FamilyScope = Depends(family_session),
) -> PautaOut:
    """Inicia una nueva Pauta para un Hijo o Miembro de la Familia autenticada."""
    session = scope.session

    # Si sujeto es Miembro, health_visit_id debe ser NULL
    if data.member_id is not None and data.health_visit_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="health_visit_id no aplica a Pautas de Miembros",
        )

    # Validar que member_id pertenece a la Familia
    if data.member_id is not None:
        member = await session.get(Member, data.member_id)
        if member is None or member.family_id != scope.family_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="El Miembro no pertenece a esta Familia",
            )

    now = datetime.now(UTC)
    pauta = Pauta(
        family_id=scope.family_id,
        child_id=data.child_id,
        member_id=data.member_id,
        medication=data.medication,
        dose=data.dose,
        interval_hours=data.interval_hours,
        duration_days=data.duration_days,
        started_at=now,
        status="active",
        health_visit_id=data.health_visit_id,
        created_by=scope.member_id,
        created_at=now,
    )
    session.add(pauta)
    await session.flush()
    await session.refresh(pauta)
    return await _enrich_one(scope, pauta)


@router.get("/pautas")
async def list_pautas(
    scope: FamilyScope = Depends(family_session),
    status_filter: str | None = Query(None, alias="status"),
    child_id: uuid.UUID | None = Query(None),
) -> list[PautaOut]:
    """Lista las Pautas de la Familia, con filtros opcionales por status/child_id."""
    session = scope.session
    await expire_due_pautas(session)

    stmt = select(Pauta)
    if child_id:
        stmt = stmt.where(Pauta.child_id == child_id)
    stmt = stmt.order_by(Pauta.started_at.desc())
    pautas = list((await session.execute(stmt)).scalars().all())

    # status_filter se aplica tras la expiración lazy: una Pauta caducada ya está
    # 'finished', así ?status=active no la devuelve como activa.
    if status_filter:
        kept = [p for p in pautas if p.status == status_filter]
    else:
        kept = pautas

    views = await load_pauta_views(
        session, kept, today=datetime.now(UTC).date(), tz=UTC
    )
    return [_to_out(v) for v in views]


@router.get("/pautas/{pauta_id}")
async def get_pauta(
    pauta_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> PautaOut:
    """Detalle de una Pauta con campos calculados."""
    session = scope.session
    await expire_due_pautas(session)
    pauta = await _get_owned_pauta(session, pauta_id)
    return await _enrich_one(scope, pauta)


@router.post("/pautas/{pauta_id}/finish")
async def finish_pauta(
    pauta_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> PautaOut:
    """Finaliza manualmente una Pauta activa."""
    session = scope.session
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
    return await _enrich_one(scope, pauta)


@router.post("/pautas/{pauta_id}/reactivate")
async def reactivate_pauta(
    pauta_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> PautaOut:
    """Reactiva una Pauta finalizada manualmente (deshacer "Finalizar Pauta").

    Solo aplica a Pautas finalizadas que aún no han caducado: una Pauta cuyo
    `ends_at` ya pasó volvería a `finished` en el próximo expire, así que
    reactivarla no tendría efecto y devolvemos 409.
    """
    session = scope.session
    pauta = await _get_owned_pauta(session, pauta_id)
    if pauta.status == "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="La Pauta ya está activa",
        )
    if pauta.is_expired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No se puede reactivar una Pauta ya caducada",
        )
    pauta.status = "active"
    session.add(pauta)
    await session.flush()
    await session.refresh(pauta)
    return await _enrich_one(scope, pauta)
