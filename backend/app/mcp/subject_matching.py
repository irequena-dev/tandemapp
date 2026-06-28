"""Contrato ESTRICTO de resolución de un Sujeto (Hijo o Miembro) por nombre.

Resolución polimórfica que la herramienta `create_event` usa:

- Coincidencia EXACTA, CASE-INSENSITIVE (`lower(name) == lower(:name)`) contra
  `Child.name` Y `Member.display_name`. Sin fuzzy, sin trimming.
- Se EXCLUYEN los Miembros cuyo `display_name IS NULL`.
- Exactamente una coincidencia global → devuelve ese `Child` o `Member`.
- Ninguna coincidencia → `SubjectMatchError(reason="not_found")` con la lista de
  nombres válidos (Hijos + Miembros con display_name) para que el cliente MCP
  pueda corregir o desambiguar.
- Coincidencia ambigua (≥2 sujetos comparten el nombre) →
  `SubjectMatchError(reason="ambiguous")` con esa misma lista.

El resolver NO abre su propia transacción: solo consulta la sesión recibida,
de modo que el `SET LOCAL app.current_family_id` del llamador aplica (RLS).
"""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Child, Member


@dataclass
class SubjectMatchError:
    """Fallo estructurado de resolución de un Sujeto por nombre.

    `valid_names` lista los nombres válidos de la Familia: primero los Hijos
    (orden `birth_date, name`, como `list_children`) y luego los Miembros con
    `display_name` no nulo, para que el cliente pueda corregir o desambiguar.
    """

    reason: Literal["not_found", "ambiguous"]
    valid_names: list[str]


async def resolve_subject_by_name(
    session: AsyncSession, name: str
) -> Child | Member | SubjectMatchError:
    """Resuelve un Sujeto por nombre EXACTO case-insensitive en la Familia activa.

    Busca en `Child.name` y `Member.display_name` (excluye Miembros sin
    display_name). Devuelve el `Child`/`Member` si hay exactamente una
    coincidencia global, o un `SubjectMatchError` (`not_found` / `ambiguous`)
    con los nombres válidos en caso contrario. No abre transacción: consulta
    sobre `session` (RLS aplica).
    """
    children = (
        (
            await session.execute(
                select(Child).where(func.lower(Child.name) == func.lower(name))
            )
        )
        .scalars()
        .all()
    )
    members = (
        (
            await session.execute(
                select(Member).where(
                    func.lower(Member.display_name) == func.lower(name),
                    Member.display_name.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )

    matches = [*children, *members]
    if len(matches) == 1:
        return matches[0]

    valid_children = (
        (await session.execute(select(Child).order_by(Child.birth_date, Child.name)))
        .scalars()
        .all()
    )
    valid_members = (
        (
            await session.execute(
                select(Member)
                .where(Member.display_name.is_not(None))
                .order_by(Member.display_name)
            )
        )
        .scalars()
        .all()
    )
    valid_names = [c.name for c in valid_children] + [
        m.display_name for m in valid_members
    ]

    return SubjectMatchError(
        reason="not_found" if len(matches) == 0 else "ambiguous",
        valid_names=valid_names,
    )
