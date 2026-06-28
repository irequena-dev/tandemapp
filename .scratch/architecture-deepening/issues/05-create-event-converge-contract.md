# 05 — create_event converges to the unified child-resolution contract

Status: ready-for-agent

## What to build

`do_create_event` is the lone hold-out against the unified child-resolution contract. The other 5 handlers raise `ToolError` on a failed Hijo resolution → the SDK returns `isError=True` with a structured payload (`{"error": "not_found"|"ambiguous", "message": …, "valid_children": [...]}`). `create_event` instead returns a *success* whose text is a flat dict with the valid names baked into a human string: `{"error": "Hijo no encontrado: 'X'. Hijos válidos: Sofía"}`. Same concept, two surfacings. The in-code comment admits the divergence is kept only "because the test codifies exactly that shape" — a tautology, not a reason.

Now that slice 04 introduced `require_child`, converge: migrate `do_create_event` to `child = await require_child(ctx.session, name)` (keeping `child_name` optional — guard `if child_name is not None`). Delete the dict-return path and its apologetic comment. From this point all 6 child-resolution failures share one contract: `isError=True` + structured `valid_children` for disambiguation.

Record the convergence as an **ADR** under `docs/adr/` (next number), so a future architecture review does not revert it thinking it was a regression. The ADR should state: every MCP child-by-name resolution failure is signalled as a tool error (`isError=True`) with a structured payload (`error`, `message`, `valid_children`), including `create_event`; the legacy free-text dict-return contract is retired.

**Constraints:**
- The frozen test `test_create_event_child_not_found` must be rewritten, not deleted — it now asserts the structured contract.
- Do not add a separate `create_event` ambiguous test — `require_child`'s module test (from 04) already covers the ambiguous payload; `create_event` just delegates.
- Do not change the happy-path contract of `create_event` (successful creation returns the same shape).
- TDD is non-negotiable: rewrite the test to the new assertions first (it goes red), then migrate.

## Acceptance criteria

- [ ] `do_create_event` calls `require_child` and no longer returns a dict on child-resolution failure; the dict-return path and its comment are gone.
- [ ] `child_name` remains optional in `create_event` (events without a child still create normally).
- [ ] Rewritten `test_create_event_child_not_found` asserts the structured contract: `result["error"] == "not_found"` and the seeded child appears in `result["valid_children"]` (no longer `"Sofía" in result["error"]`).
- [ ] A new ADR records the convergence: all MCP child-resolution failures use `isError=True` + structured `valid_children`, including `create_event`; legacy free-text contract retired.
- [ ] No `do_*` handler in `app/mcp/server.py` returns a free-text `{"error": ...}` dict for a child-resolution failure (grep-verified invariant).
- [ ] All 6 child-resolution sites route through `require_child`.
- [ ] `pnpm test:backend` passes (needs Docker).
- [ ] `pnpm lint` passes.

## Blocked by

- 04 — `require_child` seam must exist first.

## Comments

<!-- Conversation history appends here -->
