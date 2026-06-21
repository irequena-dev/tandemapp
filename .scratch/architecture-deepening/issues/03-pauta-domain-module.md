# 03 — Pauta domain module: one deep module for next-dose, lazy-expiry, duplicate-guard

Status: done

## What to build

Deepen the Pauta/Administración domain from scattered logic across three layers into one deep module. Today the same "next dose = last Administración + Pauta interval" rule exists as:

- A per-Pauta **N+1 query** in `pautas._to_out` (queries Miembro for each Administración inside a loop — listing 10 Pautas × 5 admins ≈ 61 queries).
- A **batch-loaded** version in `today._compute_doses` (one query per entity type, in-memory lookup).

Same rule, two implementations, different performance. Change the rule → hunt both. Additionally:
- **Lazy expiry** (`_lazy_finish`) is a write side-effect hidden inside a read (list/detail), called per-item in a loop, with unclear idempotency.
- **Duplicate-guard** for Administración lives only in `api/administrations.py`, not reused by MCP's `do_record_administration`.
- MCP's `do_start_pauta` / `do_record_administration` reimplement REST creation logic.

Introduce a deep **Pauta domain module** whose interface answers the questions callers actually ask — "active Pautas for this Familia, each with its next-dose and today's Administraciones" — and hides behind it: batch-loading, lazy-expiry, next-dose math, and the duplicate-guard. REST `/pautas`, `/api/today`, and MCP `listActivePautas` / `recordAdministration` all become thin adapters over this one module.

Lazy-expiry moves from a per-read side-effect to an **explicit batched operation** the module owns (called once at the start of any read that needs fresh state). The N+1 in `pautas._to_out` is replaced by the batch strategy from `today._compute_doses`. The duplicate-guard applies to MCP too, not just REST.

This is the biggest design effort of the three slices. Run `/grilling` on the interface shape before implementing. Consider `/codebase-design`'s design-it-twice pattern to explore alternative interfaces (e.g. "return enriched Pauta objects" vs "return a read-model DTO" vs "query-style API").

**Constraints:**
- Do not change the `PautaOut` / `AdministrationOut` wire shapes exposed to the frontend without coordinating (frontend `pautas/api.ts`, `PautaCard.tsx` consume them).
- Do not move `Pauta.ends_at` / `is_expired` properties out of `models.py` unless the domain module genuinely owns them — they're pure calculations and fine where they are.
- Keep using `resolve_child_by_name` for Hijo matching (ADR-0006).
- TDD is non-negotiable: write the failing test first.

## Acceptance criteria

- [ ] Listing N Pautas issues O(1) queries per entity type, not O(N×M) — verified by a query-counter test that the current N+1 in `_to_out` would fail.
- [ ] The next-dose rule is computed in one place — REST `/pautas`, `/api/today`, and MCP `listActivePautas` agree for the same fixture (verified by a test asserting all three surfaces return the same next-dose for a shared fixture).
- [ ] Lazy-expiry is an explicit, idempotent, batched operation — not a hidden write side-effect inside a read loop.
- [ ] The duplicate-guard applies to MCP `recordAdministration` too, not just REST.
- [ ] REST `/pautas`, `/api/today`, and MCP tools are thin adapters over the domain module (no duplicated dose/expiry/dedup logic).
- [ ] All existing `test_pautas.py`, `test_administrations.py`, `test_today.py`, `test_mcp_server.py` tests pass.
- [ ] `pnpm test:backend` passes (needs Docker).
- [ ] `pnpm lint` passes.

## Blocked by

- `02-tenancy-seam-unified` — needs the unified identity path so the domain module receives `(session, family_id, member_id)` from one seam, not from three separate deps.

## Comments

<!-- Conversation history appends here -->
