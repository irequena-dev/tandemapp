# 01 — MCP tool seam: one session/RLS/identity seam + tool registry

Status: ready-for-agent

## What to build

Deepen the MCP tool layer (`backend/app/mcp/server.py`, ~1089 lines) from a wide shallow module into a deep one. Today each of the 11 `do_*` tool functions repeats identical scaffolding: extract identity from `request.scope["state"][MCP_IDENTITY_KEY]`, open a session, begin a transaction, run `SELECT set_config('app.current_family_id', ..., true)` for RLS. This boilerplate is duplicated 11 times with no seam. Tool dispatch is a 12-way `if/elif` chain in `handle_call_tool` with no registry — adding a tool means editing the dispatcher too. Error handling is inconsistent: some tools return error dicts, others raise `ValueError`.

Introduce **one seam** (working name `tool_session`) that every tool crosses. The seam owns: opening the session, `SET LOCAL app.current_family_id`, identity extraction, and error normalization. Its interface yields the scoped session **and** the resolved `(member_id, family_id)` so tools stop re-deriving identity. Replace the `if/elif` dispatcher with a **registry** mapping tool name → handler, so adding a tool is one entry, not two edits. Pick **one error contract** (the structured dict from ADR-0006's `ChildMatchError` is the precedent) and route all tool errors through it. Each `do_*` function shrinks to domain logic only (resolve Hijo via `resolve_child_by_name` per ADR-0006, insert, return).

This is the first slice in the chain #1 → #3 → #2. It makes slice 02 (tenancy seam unification) easy because the `tool_session` seam becomes the natural place to route MCP through `family_session` + `_materialize`.

**Constraints:**
- Do not add NLP (ADR-0002 — backend receives structured args).
- Do not change the tool schemas exposed to Claude (the seam is internal).
- Do not fuzzy-match Hijos (ADR-0006 — keep routing through `resolve_child_by_name`).
- TDD is non-negotiable: write the failing test first.

## Acceptance criteria

- [ ] No `do_*` tool function opens its own session or calls `set_config` directly — all cross the `tool_session` seam. Verified by a test that asserts this invariant.
- [ ] A registry maps tool name → handler; adding a tool requires zero edits to the dispatcher logic (just one registry entry).
- [ ] All tool errors follow one contract (structured dict, same shape as `ChildMatchError` responses).
- [ ] All existing `backend/tests/test_mcp_*.py` tests pass through the new seam.
- [ ] Each `do_*` function contains only domain logic (resolve Hijo, insert, return) — no session/RLS/identity boilerplate.
- [ ] `pnpm test:backend` passes (needs Docker).
- [ ] `pnpm lint` passes.

## Blocked by

None — can start immediately.

## Comments

<!-- Conversation history appends here -->
