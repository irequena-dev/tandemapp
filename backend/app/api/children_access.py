"""Seam REST para cargar un Hijo propiedad de la Familia activa o fallar con 404.

Antes esta lógica estaba duplicada en `children`, `measurements`, `sizes` y
`health_visits`. Ahora hay un solo lugar: RLS (cláusula USING) ya oculta los
Hijos de otras Familias, así que un id ajeno se comporta como inexistente → 404,
nunca 403.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Child


async def get_owned_child(session: AsyncSession, child_id: uuid.UUID) -> Child:
    """Carga un Hijo de la Familia activa o lanza 404."""
    child = await session.get(Child, child_id)
    if child is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Hijo no encontrado"
        )
    return child
