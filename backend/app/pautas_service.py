"""Módulo de dominio Pauta: la fuente única de verdad para tres reglas que antes
vivían duplicadas en los adaptadores REST/MCP/today:

- **Expiración lazy** (`expire_due_pautas`): explícita, idempotente y batched.
  Una sola SELECT de activas + filtrado Python por la propiedad `is_expired`.
- **Enriquecimiento** (`load_pauta_views`): batch-loaded (O(1) queries por tipo
  de entidad). Calcula `next_dose_at = última admin + intervalo` (o
  `started_at + intervalo` si ninguna) y las administraciones de hoy.
- **Guarda de duplicado** (`create_or_duplicate_administration`): compartida por
  REST y MCP. Devuelve la existente si hay otra dentro de ±DUPLICATE_GUARD_MIN.

Los adaptadores (`api/pautas.py`, `api/today.py`, `mcp/server.py`,
`api/administrations.py`) son finos y proyectan estos view objects.
"""

from collections.abc import AsyncIterator  # noqa: F401  (reservado para futuras API)
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import DUPLICATE_GUARD_MINUTES, Administration, Child, Member, Pauta


@dataclass
class AdminView:
    """Una Administración enriquecida con el nombre del Miembro que la dio."""

    admin: Administration
    member_name: str | None


@dataclass
class PautaView:
    """Una Pauta enriquecida para proyección: próxima toma, admins de hoy, nombre
    del Hijo."""

    pauta: Pauta
    child_name: str | None
    next_dose_at: datetime | None
    todays_administrations: list[AdminView]


async def expire_due_pautas(session: AsyncSession) -> list[Pauta]:
    """Expiración lazy explícita, idempotente y batched.

    Las Pautas activas cuyo `ends_at` ya pasó (`is_expired`) pasan a 'finished'.
    Llamar UNA vez al inicio de cualquier lectura que necesite estado fresco.
    Una sola SELECT de activas + filtrado Python por la propiedad `is_expired`;
    un único flush si hubo cambios. Idempotente: una segunda llamada no encuentra
    activas expiradas (ya están 'finished').
    """
    result = await session.execute(select(Pauta).where(Pauta.status == "active"))
    active = list(result.scalars().all())
    changed = [p for p in active if p.is_expired]
    if changed:
        for p in changed:
            p.status = "finished"
            session.add(p)
        await session.flush()
    return changed


async def load_pauta_views(
    session: AsyncSession,
    pautas: list[Pauta],
    *,
    today: date,
    tz: ZoneInfo | type[UTC],
) -> list[PautaView]:
    """Enriquecimiento batch-loaded: O(1) queries por tipo de entidad (children,
    administrations, members).

    - `next_dose_at = última admin + intervalo` (o `started_at + intervalo` si
      ninguna); `None` si la Pauta no está activa.
    - `todays_administrations` = admins cuya fecha (en `tz`) == `today`, asc.
    """
    if not pautas:
        return []

    child_ids = {p.child_id for p in pautas}
    child_names: dict = {}
    if child_ids:
        children = (
            (await session.execute(select(Child).where(Child.id.in_(child_ids))))
            .scalars()
            .all()
        )
        child_names = {c.id: c.name for c in children}

    pauta_ids = [p.id for p in pautas]
    all_admins = list(
        (
            await session.execute(
                select(Administration)
                .where(Administration.pauta_id.in_(pauta_ids))
                .order_by(Administration.administered_at.asc())
            )
        )
        .scalars()
        .all()
    )

    member_ids = {a.administered_by for a in all_admins}
    member_names: dict = {}
    if member_ids:
        members = (
            (await session.execute(select(Member).where(Member.id.in_(member_ids))))
            .scalars()
            .all()
        )
        member_names = {m.id: m.display_name for m in members}

    by_pauta: dict = {}
    for a in all_admins:
        by_pauta.setdefault(a.pauta_id, []).append(a)

    views: list[PautaView] = []
    for pauta in pautas:
        admins = by_pauta.get(pauta.id, [])
        if pauta.status == "active":
            base = admins[-1].administered_at if admins else pauta.started_at
            next_dose_at = base + timedelta(hours=pauta.interval_hours)
        else:
            next_dose_at = None
        todays = [
            AdminView(a, member_names.get(a.administered_by))
            for a in admins
            if a.administered_at.astimezone(tz).date() == today
        ]
        views.append(
            PautaView(
                pauta=pauta,
                child_name=child_names.get(pauta.child_id),
                next_dose_at=next_dose_at,
                todays_administrations=todays,
            )
        )
    return views


async def create_or_duplicate_administration(
    session: AsyncSession,
    pauta: Pauta,
    member_id: str,
    *,
    administered_at: datetime | None = None,
) -> tuple[Administration, bool]:
    """Guarda de duplicado compartida (REST + MCP).

    Si existe una Administración de esta Pauta dentro de
    ±DUPLICATE_GUARD_MINUTES de `administered_at` (default now), la devuelve
    (`is_duplicate=True`); si no, crea una nueva (`False`).
    """
    at = administered_at if administered_at is not None else datetime.now(UTC)
    window_start = at - timedelta(minutes=DUPLICATE_GUARD_MINUTES)
    window_end = at + timedelta(minutes=DUPLICATE_GUARD_MINUTES)
    existing = (
        await session.execute(
            select(Administration)
            .where(
                Administration.pauta_id == pauta.id,
                Administration.administered_at >= window_start,
                Administration.administered_at <= window_end,
            )
            .order_by(Administration.administered_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing is not None:
        return existing, True

    admin = Administration(
        family_id=pauta.family_id,
        pauta_id=pauta.id,
        administered_at=at,
        administered_by=member_id,
    )
    session.add(admin)
    await session.flush()
    await session.refresh(admin)
    return admin, False
