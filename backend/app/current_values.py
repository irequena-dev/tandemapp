"""Seam de dominio para el «valor actual» de Medidas y Tallas de un Hijo.

CONTEXT.md: una Medida/Talla es append-only y «el valor actual es el más
reciente». Esa regla (último registro de un tipo para un Hijo, ordenado por
fecha de medida/talla y luego por creación) vivía duplicada como query
`.order_by(...desc()).limit(1)` en varios handlers REST. Ahora vive aquí, en un
solo lugar. RLS acota las filas a la Familia activa.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from .models import Measurement, Size


async def latest_measurement(
    session: AsyncSession, child_id: uuid.UUID, type_: str
) -> Measurement | None:
    """La Medida más reciente de `type_` para el Hijo, o None."""
    stmt = (
        select(Measurement)
        .where(
            col(Measurement.child_id) == child_id,
            col(Measurement.type) == type_,
        )
        .order_by(
            col(Measurement.measured_at).desc(),
            col(Measurement.created_at).desc(),
        )
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def latest_size(
    session: AsyncSession, child_id: uuid.UUID, type_: str
) -> Size | None:
    """La Talla más reciente de `type_` para el Hijo, o None."""
    stmt = (
        select(Size)
        .where(col(Size.child_id) == child_id, col(Size.type) == type_)
        .order_by(col(Size.recorded_at).desc(), col(Size.created_at).desc())
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none()
