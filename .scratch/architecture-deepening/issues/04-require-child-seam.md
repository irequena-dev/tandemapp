# 04 — require_child: one raising seam for child-by-name resolution

Status: ready-for-agent

## What to build

The MCP layer has no locality for the concept *"turn a spoken Hijo name into the owned Child, surfacing structured failure to the model."* Today `resolve_child_by_name` (`app/mcp/child_matching.py`) returns a union `Child | ChildMatchError`, so every handler repeats the same dance: call it, `isinstance`-check, convert to a `ToolError` via `ToolError.child_match_error`. This 4-line block is smeared across 5 handlers (`do_record_health_visit`, `do_start_pauta`, `do_list_active_pautas`, `do_record_measurement`, `do_record_size`). The failure-surfacing rule lives nowhere; it is re-derived at each call site.

Introduce **one raising seam** that composes the strict union resolver with the error conversion:

```python
async def require_child(session: AsyncSession, name: str) -> Child:
    """Resuelve un Hijo por nombre EXACTO; lanza ToolError si no es único."""
    result = await resolve_child_by_name(session, name)
    if isinstance(result, ChildMatchError):
        raise ToolError.child_match_error(result)
    return result
```

`require_child` owns the resolve-or-raise control flow; `ToolError.child_match_error` keeps owning how a child-match failure is shaped for the model (they are different concerns and stay split). `child_matching.py` stays pure — the dependency stays one-way (`mcp → child_matching`); do **not** make it import `ToolError`.

Migrate the 5 handlers above from the inline dance to `child = await require_child(ctx.session, name)`. RLS is unchanged: the session already carries `SET LOCAL app.current_family_id` from `tool_session` → `open_family_scope`, so passing `ctx.session` is sufficient (the strict resolver already relies on exactly this).

This slice is **behavior-preserving** — no bytes the model sees change. It exists to make slice 05 (the `create_event` contract convergence) an easy change. `do_create_event` keeps its current dict-return contract in this slice; it is migrated in 05.

**Constraints:**
- Do not change what the model sees: the 5 migrated handlers must raise the identical `ToolError` payload they raise today.
- Do not touch `resolve_child_by_name` — it is still the correct interface for callers that want the structured `ChildMatchError` payload.
- Do not move shaping logic into `require_child`; `ToolError.child_match_error` remains the home for payload shaping.
- TDD is non-negotiable: write the failing test first.

## Acceptance criteria

- [ ] `require_child(session, name)` exists in `app/mcp/server.py`, co-located with `ToolError.child_match_error`.
- [ ] New module test (style of `test_mcp_dates_module.py` / `test_current_values_module.py`) codifies the seam's invariant: exact match → `Child`; zero matches → raises `ToolError` with `error == "not_found"`; ≥2 matches → raises with `error == "ambiguous"`; both error payloads carry `valid_children`.
- [ ] The 5 handlers no longer contain the `resolve_child_by_name` + `isinstance(result, ChildMatchError)` + `ToolError.child_match_error` inline block — each calls `require_child`.
- [ ] `app/mcp/child_matching.py` does not import from `app/mcp/server.py` (one-way dependency verified).
- [ ] The 5 handlers' existing child-not-found / child-ambiguous tests pass **unchanged** (regression net — proves behavior preservation).
- [ ] `do_create_event` is **not** modified in this slice (deferred to 05).
- [ ] `pnpm test:backend` passes (needs Docker).
- [ ] `pnpm lint` passes.

## Blocked by

None — can start immediately.

## Comments

<!-- Conversation history appends here -->
