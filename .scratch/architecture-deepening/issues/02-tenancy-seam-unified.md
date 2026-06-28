# 02 — Tenancy seam: `family_session` yields session + identity together

Status: done

## What to build

Close the ADR-0005 tenancy leaks. ADR-0005 mandates a single seam (`tenancy.family_session`) that fixes `app.current_family_id` per transaction and materializes Clerk identity — "ningún handler fija la variable ad hoc." In practice, handlers leak past it three ways:

1. **REST handlers inject `current_family_id` as a separate `Depends`** and set `family_id` on the model by hand (e.g. `children.py`, `pautas.py`). This is the ad-hoc fix ADR-0005 forbids.
2. **REST handlers inject `current_member_id` the same way** for attribution (e.g. `pautas.py`).
3. **MCP tools do their own manual `SET LOCAL`** instead of going through `family_session` — a separate identity/RLS path.

Deepen `family_session` so its interface yields **both** the scoped session **and** the resolved `(family_id, member_id)` as one object. REST handlers receive that one object and stop declaring `Depends(current_family_id)` / `Depends(current_member_id)` separately. MCP tools route through the same seam via the `tool_session` from issue 01 (which should delegate to `family_session` or share its implementation).

The result: one door for identity/RLS, not three. The ADR-0005 invariant becomes enforceable by construction, not by vigilance.

**Note:** The "fresh MCP token" scenario (a Miembro's first action being voice) is not a real bug — obtaining an MCP token requires prior PWA login, so REST always seeds `families`/`members` first. The value of this slice is ADR-0005 compliance, locality (RLS setup in one place), and leverage (handlers stop re-deriving identity the seam should give them).

**Constraints:**
- Do not change the RLS policies or the `tandem_app` role (ADR-0005).
- Do not change Clerk integration or the `MCP_IDENTITY_KEY` mechanism.
- TDD is non-negotiable: write the failing test first.

## Acceptance criteria

- [ ] No REST handler declares `Depends(current_family_id)` or `Depends(current_member_id)` directly — verified by a test that asserts this invariant (the ADR-0005 rule, enforceable by construction).
- [ ] `family_session` yields `(session, family_id, member_id)` together as one object; handlers receive identity from the seam, not from separate deps.
- [ ] MCP tools route through `family_session` (via the `tool_session` from issue 01), not through manual `SET LOCAL`.
- [ ] All existing `backend/tests/test_isolation.py`, `test_identity.py`, and `test_mcp_*.py` tests pass.
- [ ] `pnpm test:backend` passes (needs Docker).
- [ ] `pnpm lint` passes.

## Blocked by

- `01-mcp-tool-seam` — the `tool_session` seam from issue 01 is the natural place to route MCP through `family_session`.

## Comments

<!-- Conversation history appends here -->
