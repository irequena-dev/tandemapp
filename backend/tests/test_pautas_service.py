"""Tests del módulo de dominio Pauta (`app.pautas_service`) y de los adaptadores
finales que lo proyectan (REST `/pautas`, `/api/today`, MCP `list_active_pautas`
y `record_administration`).

Issue 03:
- `load_pauta_views` es batch-loaded (sin N+1).
- `next_dose_at` coincide entre las tres superficies.
- `expire_due_pautas` es lazy-explícita, idempotente y batched.
- la guarda de duplicado es compartida (REST + MCP).
- los adaptadores son finos: la matemática de próxima toma y la guarda de
  duplicado viven SOLO en `pautas_service.py`.
"""

import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from httpx import AsyncClient
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Administration, Child, Family, Member, Pauta
from app.pautas_service import (
    expire_due_pautas,
    load_pauta_views,
)


def _as(identity: dict, org_id: str, user_id: str) -> None:
    identity.clear()
    identity.update({"org_id": org_id, "sub": user_id})


async def _create_child(client: AsyncClient, name: str = "Mateo") -> str:
    resp = await client.post(
        "/children", json={"name": name, "birth_date": "2020-03-15"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _json_content(result) -> dict:
    """Extrae el payload JSON del resultado textual de una tool MCP."""
    for item in getattr(result, "content", []) or []:
        txt = getattr(item, "text", None)
        if txt:
            return json.loads(txt)
    raise AssertionError(f"sin payload en {result!r}")


def _norm(iso: str | datetime) -> datetime:
    if isinstance(iso, datetime):
        return iso.replace(microsecond=0, tzinfo=None)
    return datetime.fromisoformat(str(iso)).replace(microsecond=0, tzinfo=None)


# ---------- 1. Batch loading: sin N+1 -----------------------------------------


@pytest.mark.asyncio
async def test_load_pauta_views_no_n_plus_1(admin_session: AsyncSession) -> None:
    """`load_pauta_views` emite un nº de queries acotado por tipo de entidad, no
    por nº de Administraciones."""
    org = f"org_svc_n1_{datetime.now(UTC).timestamp():.0f}"
    admin_session.add(Family(id=org))
    await admin_session.flush()
    member = Member(id=f"user_{org}", family_id=org, display_name="Progenitor")
    admin_session.add(member)
    child = Child(family_id=org, name="Niño N+1", birth_date=date(2021, 1, 1))
    admin_session.add(child)
    await admin_session.flush()

    now = datetime.now(UTC)
    pauta = Pauta(
        family_id=org,
        child_id=child.id,
        medication="Ibuprofeno",
        dose="3 ml",
        interval_hours=8,
        duration_days=7,
        started_at=now,
        status="active",
        created_by=member.id,
        created_at=now,
    )
    admin_session.add(pauta)
    await admin_session.flush()
    pauta_id = pauta.id
    member_id = member.id

    admin_session.add(
        Administration(
            family_id=org,
            pauta_id=pauta_id,
            administered_at=now,
            administered_by=member_id,
        )
    )
    await admin_session.commit()
    # Recargar para evitar atributos expirados tras commit (expire_on_commit).
    pauta_a = (
        await admin_session.execute(select(Pauta).where(Pauta.id == pauta_id))
    ).scalar_one()

    engine = admin_session.get_bind()
    counts: list[int] = []
    listener = lambda *a, **k: counts.append(1)  # noqa: E731

    event.listen(engine, "before_cursor_execute", listener)
    try:
        views_a = await load_pauta_views(
            admin_session, [pauta_a], today=now.date(), tz=UTC
        )
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    count_a = len(counts)
    assert len(views_a[0].todays_administrations) == 1

    # Escenario B: misma Pauta, ahora con 10 admins totales.
    for i in range(1, 10):
        admin_session.add(
            Administration(
                family_id=org,
                pauta_id=pauta_id,
                administered_at=now + timedelta(minutes=i),
                administered_by=member_id,
            )
        )
    await admin_session.commit()
    pauta_b = (
        await admin_session.execute(select(Pauta).where(Pauta.id == pauta_id))
    ).scalar_one()

    counts.clear()
    event.listen(engine, "before_cursor_execute", listener)
    try:
        views_b = await load_pauta_views(
            admin_session, [pauta_b], today=now.date(), tz=UTC
        )
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    count_b = len(counts)
    assert len(views_b[0].todays_administrations) == 10

    assert count_b == count_a, f"N+1 detectado: {count_a} -> {count_b}"
    assert count_b <= 4, f"demasiadas queries: {count_b}"


# ---------- 2. next_dose_at coherente entre superficies ----------------------


@pytest.mark.asyncio
async def test_next_dose_agrees_across_surfaces(
    auth_client: AsyncClient,
    identity: dict,
    admin_session: AsyncSession,
    mcp_client_factory,
) -> None:
    """REST /pautas, MCP list_active_pautas y load_pauta_views coinciden."""
    org = "org_svc_agree"
    _as(identity, org, "user_agree")
    child_id = await _create_child(auth_client)

    pauta_resp = await auth_client.post(
        "/pautas",
        json={
            "child_id": child_id,
            "medication": "Amoxicilina",
            "dose": "5 ml",
            "interval_hours": 8,
            "duration_days": 7,
        },
    )
    assert pauta_resp.status_code == 201, pauta_resp.text
    pauta_id = pauta_resp.json()["id"]

    admin_resp = await auth_client.post(f"/pautas/{pauta_id}/administrations", json={})
    assert admin_resp.status_code == 201, admin_resp.text

    # (a) REST /pautas
    rest_next = next(
        p["next_dose_at"]
        for p in (await auth_client.get("/pautas")).json()
        if p["id"] == pauta_id
    )

    # (b) MCP list_active_pautas
    token = (await auth_client.post("/mcp-tokens")).json()["token"]
    async with mcp_client_factory(token) as c:
        rows = _json_content(await c.call_tool("list_active_pautas", {}))
    mcp_next = next(p["next_dose_at"] for p in rows if p["id"] == pauta_id)

    # (c) load_pauta_views directo
    pauta_row = (
        await admin_session.execute(select(Pauta).where(Pauta.id == pauta_id))
    ).scalar_one()
    views = await load_pauta_views(
        admin_session, [pauta_row], today=datetime.now(UTC).date(), tz=UTC
    )
    module_next = views[0].next_dose_at

    assert rest_next is not None
    assert mcp_next is not None
    assert module_next is not None
    assert _norm(rest_next) == _norm(mcp_next)
    assert _norm(rest_next) == _norm(module_next)


# ---------- 3. expire_due_pautas: idempotente y batched ----------------------


@pytest.mark.asyncio
async def test_expire_due_pautas_is_idempotent_and_batched(
    admin_session: AsyncSession,
) -> None:
    org = f"org_svc_exp_{datetime.now(UTC).timestamp():.0f}"
    admin_session.add(Family(id=org))
    await admin_session.flush()
    member = Member(id=f"user_{org}", family_id=org, display_name="Progenitor")
    admin_session.add(member)
    child = Child(family_id=org, name="Niño Exp", birth_date=date(2021, 1, 1))
    admin_session.add(child)
    await admin_session.flush()

    now = datetime.now(UTC)
    started = now - timedelta(days=10)
    expired = Pauta(
        family_id=org,
        child_id=child.id,
        medication="Caduca",
        dose="1 ml",
        interval_hours=8,
        duration_days=3,
        started_at=started,
        status="active",
        created_by=member.id,
        created_at=started,
    )
    admin_session.add(expired)
    await admin_session.flush()
    expired_id = expired.id
    await admin_session.commit()

    changed = await expire_due_pautas(admin_session)
    assert any(p.id == expired_id for p in changed)
    await admin_session.commit()
    reloaded = (
        await admin_session.execute(select(Pauta).where(Pauta.id == expired_id))
    ).scalar_one()
    assert reloaded.status == "finished"

    # Idempotente.
    changed_again = await expire_due_pautas(admin_session)
    assert not any(p.id == expired_id for p in changed_again)
    reloaded2 = (
        await admin_session.execute(select(Pauta).where(Pauta.id == expired_id))
    ).scalar_one()
    assert reloaded2.status == "finished"

    # Bounded queries en estado settled: 1 SELECT de activas, 0 UPDATE.
    engine = admin_session.get_bind()
    counts: list[int] = []
    listener = lambda *a, **k: counts.append(1)  # noqa: E731
    event.listen(engine, "before_cursor_execute", listener)
    try:
        await expire_due_pautas(admin_session)
    finally:
        event.remove(engine, "before_cursor_execute", listener)
    assert len(counts) <= 2, f"demasiadas queries: {len(counts)}"


# ---------- 4. Guarda de duplicado compartida en MCP -------------------------


@pytest.mark.asyncio
async def test_mcp_record_administration_duplicate_guard(
    auth_client: AsyncClient, identity: dict, mcp_client_factory
) -> None:
    """Dos llamadas rápidas a record_administration: la segunda es duplicado."""
    _as(identity, "org_svc_dup", "user_dup")
    token = (await auth_client.post("/mcp-tokens")).json()["token"]
    await _create_child(auth_client)

    async with mcp_client_factory(token) as c:
        start = await c.call_tool(
            "start_pauta",
            {
                "child_name": "Mateo",
                "medication": "Paracetamol",
                "dose": "2.5 ml",
                "interval": 6,
                "duration": 5,
            },
        )
        pauta_id = _json_content(start)["id"]

        first = _json_content(
            await c.call_tool("record_administration", {"pauta_id": pauta_id})
        )
        second = _json_content(
            await c.call_tool("record_administration", {"pauta_id": pauta_id})
        )

    assert first["duplicate"] is False
    assert second["duplicate"] is True
    assert second["id"] == first["id"]


# ---------- 5. Adaptadores finos: invariantes estáticos -----------------------


def test_thin_adapters_no_inline_dose_or_dedup_logic() -> None:
    """api/pautas.py, api/today.py y mcp/server.py NO contienen la matemática de
    próxima toma (`+ timedelta(hours=`) ni `DUPLICATE_GUARD_MINUTES`."""
    base = Path(__file__).resolve().parent.parent / "app"
    targets = [
        base / "api" / "pautas.py",
        base / "api" / "today.py",
        base / "mcp" / "server.py",
    ]
    offenders: list[str] = []
    for path in targets:
        src = path.read_text(encoding="utf-8")
        if "+ timedelta(hours=" in src:
            offenders.append(f"{path.name}: contains '+ timedelta(hours='")
        if "DUPLICATE_GUARD_MINUTES" in src:
            offenders.append(f"{path.name}: contains 'DUPLICATE_GUARD_MINUTES'")
    assert not offenders, "adaptadores no finos: " + "; ".join(offenders)
