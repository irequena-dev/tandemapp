# Testing & TDD

## TDD is non-negotiable (always test-first)

- **Every** change is developed test-first — including autonomous bug fixes. For a bug, the failing test *is* the reproduction; write it first, then fix.
- Test external behavior at the highest seam possible, never implementation details.
- No test debt: if a feature ships, its tests ship with it. No TODOs, no "I'll add tests later".
- The `tdd` skill is available.

## Backend tests

- `pytest` with `asyncio_mode = auto`; **real ephemeral Postgres via testcontainers** (no SQLite, no mocks) and an in-process ASGI client. Requires Docker. Exercises RLS + JSONB against real Postgres.

## Frontend tests

- **Vitest + jsdom + Testing Library**; **MSW** for the route/page seam (planned, mocking the network at the HTTP boundary, without mocking TanStack Query internals). The initial smoke test mocks `@clerk/react`.
