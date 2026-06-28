import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from ..current_values import latest_measurement
from ..models import (
    CurrentMeasurementsOut,
    Measurement,
    MeasurementCreate,
    MeasurementOut,
    MeasurementUpdate,
)
from ..tenancy import FamilyScope, family_session
from .children_access import get_owned_child

router = APIRouter(tags=["measurements"])


async def _get_owned_measurement(
    session: AsyncSession, child_id: uuid.UUID, measurement_id: uuid.UUID
) -> Measurement:
    stmt = select(Measurement).where(
        Measurement.id == measurement_id, Measurement.child_id == child_id
    )
    result = await session.execute(stmt)
    m = result.scalar_one_or_none()
    if m is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Medida no encontrada"
        )
    return m


@router.get("/children/{child_id}/measurements")
async def list_measurements(
    child_id: uuid.UUID,
    type: str | None = Query(None, pattern="^(height|weight)$"),
    scope: FamilyScope = Depends(family_session),
) -> list[MeasurementOut]:
    """Histórico de Medidas de un Hijo, opcionalmente filtrado por tipo."""
    session = scope.session
    await get_owned_child(session, child_id)
    stmt = select(Measurement).where(Measurement.child_id == child_id)
    if type is not None:
        stmt = stmt.where(Measurement.type == type)
    stmt = stmt.order_by(Measurement.measured_at.desc(), Measurement.created_at.desc())
    result = await session.execute(stmt)
    return [MeasurementOut.model_validate(m) for m in result.scalars().all()]


@router.get("/children/{child_id}/measurements/current")
async def current_measurements(
    child_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> CurrentMeasurementsOut:
    """Valor más reciente de cada tipo (height / weight) para un Hijo."""
    session = scope.session
    await get_owned_child(session, child_id)
    out = CurrentMeasurementsOut()
    for mtype in ("height", "weight"):
        m = await latest_measurement(session, child_id, mtype)
        if m is not None:
            if mtype == "height":
                out.height = MeasurementOut.model_validate(m)
            else:
                out.weight = MeasurementOut.model_validate(m)
    return out


@router.post("/children/{child_id}/measurements", status_code=status.HTTP_201_CREATED)
async def create_measurement(
    child_id: uuid.UUID,
    data: MeasurementCreate,
    scope: FamilyScope = Depends(family_session),
) -> MeasurementOut:
    """Registra una Medida para un Hijo de la Familia autenticada."""
    session = scope.session
    await get_owned_child(session, child_id)
    measurement = Measurement(
        family_id=scope.family_id,
        child_id=child_id,
        type=data.type,
        value=data.value,
        unit=data.unit,
        measured_at=data.measured_at,
        recorded_by=scope.member_id,
        created_at=datetime.now(UTC),
    )
    session.add(measurement)
    await session.flush()
    await session.refresh(measurement)
    return MeasurementOut.model_validate(measurement)


@router.patch("/children/{child_id}/measurements/{measurement_id}")
async def update_measurement(
    child_id: uuid.UUID,
    measurement_id: uuid.UUID,
    data: MeasurementUpdate,
    scope: FamilyScope = Depends(family_session),
) -> MeasurementOut:
    """Corrige una Medida existente (valor, unidad o fecha)."""
    session = scope.session
    m = await _get_owned_measurement(session, child_id, measurement_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(m, field, value)
    session.add(m)
    await session.flush()
    await session.refresh(m)
    return MeasurementOut.model_validate(m)


@router.delete(
    "/children/{child_id}/measurements/{measurement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_measurement(
    child_id: uuid.UUID,
    measurement_id: uuid.UUID,
    scope: FamilyScope = Depends(family_session),
) -> None:
    """Elimina una Medida (corrección: el dato se borra definitivamente)."""
    session = scope.session
    m = await _get_owned_measurement(session, child_id, measurement_id)
    await session.delete(m)
    await session.flush()
