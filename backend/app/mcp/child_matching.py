"""Contrato ESTRICTO de resolución de un Hijo por nombre.

Resolución reutilizable que las herramientas MCP futuras llamarán:

- Coincidencia EXACTA, CASE-INSENSITIVE (`lower(name) == lower(:name)`).
  Sin fuzzy, sin trimming: el nombre que llega se compara tal cual.
- Exactamente una coincidencia → devuelve el `Child`.
- Ninguna coincidencia → `ChildMatchError(reason="not_found")` con la lista de
  Hijos válidos de la Familia, para que el cliente MCP (Claude) pueda
  desambiguar.
- Coincidencia ambigua (≥2 Hijos de la Familia comparten el nombre) →
  `ChildMatchError(reason="ambiguous")` con esa misma lista.

El resolver NO abre su propia transacción: solo consulta la sesión recibida,
de modo que el `SET LOCAL app.current_family_id` del llamador aplica (RLS).
"""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Child


@dataclass
class ChildMatchError:
    """Fallo estructurado de resolución de un Hijo por nombre.

    `valid_children` lista los Hijos válidos de la Familia (mismo orden que
    `list_children`: `birth_date, name`) para que el cliente pueda corregir o
    desambiguar la petición.
    """

    reason: Literal["not_found", "ambiguous"]
    valid_children: list[Child]


async def resolve_child_by_name(
    session: AsyncSession, name: str
) -> Child | ChildMatchError:
    """Resuelve un Hijo por nombre EXACTO case-insensitive en la Familia activa.

    Devuelve el `Child` si hay exactamente una coincidencia, o un
    `ChildMatchError` (`not_found` / `ambiguous`) con los Hijos válidos en caso
    contrario. No abre transacción: consulta sobre `session` (RLS aplica).
    """
    matches = (
        (
            await session.execute(
                select(Child).where(func.lower(Child.name) == func.lower(name))
            )
        )
        .scalars()
        .all()
    )

    if len(matches) == 1:
        return matches[0]

    valid = (
        (await session.execute(select(Child).order_by(Child.birth_date, Child.name)))
        .scalars()
        .all()
    )

    return ChildMatchError(
        reason="not_found" if len(matches) == 0 else "ambiguous",
        valid_children=list(valid),
    )
