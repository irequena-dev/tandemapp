# AGENTS.md — Tándem

Platform to share the logistical mental load of parenting and the home among the Miembros of a Familia. Hands-free input by voice (via Claude/MCP) and fast visual consultation/validation in a PWA.

Monorepo: **backend** FastAPI (`/backend`, Python 3.12 with uv) + **frontend** React 19 (`/frontend`, Vite + TypeScript, pnpm). The root `package.json` orchestrates both with `concurrently`.

**At session start**, read the domain documentation (it is the source of truth):
- `CONTEXT.md` — glossary of the ubiquitous language.
- `docs/adr/` — architecture decisions (respect them).
- `docs/prd/tandem-plataforma-mvp.md` — index/roadmap by phases; each phase has its own PRD.
- `docs/issues/` — work sliced into vertical tracer bullets.

The ubiquitous language is in Spanish (Familia, Miembro, Hijo, Medida, Talla, Ítem de compra, Evento, Serie, Tipo de Evento, Visita médica, Pauta, Administración). Keep those terms in Spanish even in English prose. Display brand = **"Tándem"**; technical slug (code, dirs, DB) = **`tandem`**.

## Setup

- Requirements: **pnpm**, **uv** and **Docker**.
- Environment variables (`*.env.local` files, gitignored):
  - `frontend/.env.local`: `VITE_CLERK_PUBLISHABLE_KEY` and, optionally, `VITE_API_URL` (defaults to `http://localhost:8000`).
  - `backend/.env.local`: `CLERK_SECRET_KEY` (via `clerk env pull`), `DATABASE_URL` (async, `postgresql+asyncpg://...`) and `FRONTEND_ORIGIN` (defaults to `http://localhost:5173`).
- Development Postgres runs in Docker (`tandem-dev-db`, port 5544), managed by `scripts/dev-db.sh` (idempotent). `pnpm dev` starts it automatically.
- Do not read or print `*.env.local` files (they contain secrets). Fresh start: `pnpm install` (root) + `pnpm -C frontend install`.

## Commands

Everything via **pnpm** from the root (never npm).

| Task                                    | Command                        |
| --------------------------------------- | ------------------------------ |
| Full dev (DB + back + front)            | `pnpm dev`                     |
| Frontend only                           | `pnpm dev:frontend`            |
| Backend only                            | `pnpm dev:backend`             |
| Start the dev DB                        | `pnpm db`                      |
| Full lint (front + back)                | `pnpm lint`                    |
| Frontend lint (eslint)                  | `pnpm lint:frontend`           |
| Backend lint (ruff check + format)      | `pnpm lint:backend`            |
| Frontend tests (vitest)                 | `pnpm test:frontend`           |
| Backend tests (pytest + testcontainers) | `pnpm test:backend`            |
| Frontend typecheck                      | `pnpm -C frontend exec tsc -b` |

`pnpm dev` brings up, in order: dev DB → frontend (Vite, `localhost:5173`) → backend (FastAPI, `localhost:8000`).

## Backend

- **FastAPI + uv** (Python 3.12), **SQLModel** (SQLAlchemy + Pydantic) + **asyncpg** over **PostgreSQL**. Async end to end.
- Structure under `app/`: `config.py`, `database.py`, `auth.py`, `api/` (routers). Exposes the **REST API** (PWA) and, later, the remote **MCP server**.
- **Auth**: verifies the Clerk JWT with the official `clerk-backend-api` SDK (`authenticate_request`, networkless via JWKS). Actions are attributed to the Miembro.
- **Multi-tenancy**: every table carries `family_id`; isolation is **defense in depth** (app-layer filtering + **RLS** in Postgres via a `SET LOCAL` session variable per transaction). *(Implemented in issue 02; see PRD Phase 0.)*
- **ADR-0002**: the backend does **not** interpret natural language. Claude (the MCP client) picks the intent and extracts structured data; the backend validates (Pydantic) and persists.
- **Lint/format**: `ruff` (configured in `pyproject.toml`; `B008` is ignored because `Depends()` in defaults is the idiomatic FastAPI pattern).
- **Tests**: `pytest` with `asyncio_mode = auto`; **real ephemeral Postgres via testcontainers** (no SQLite, no mocks) and an in-process ASGI client. Requires Docker.

## Frontend

- **React 19 + Vite + TypeScript**, set up as a **PWA**. Package manager: **pnpm**.
- **Auth**: `@clerk/react` (NOT `@clerk/nextjs` nor `@clerk/clerk-react`). New API: conditional rendering with `<Show when="signed-in" | "signed-out">`, `OrganizationSwitcher` for the Familia (≡ Clerk Organization), `UserButton`.
- **State/data**: TanStack Query **planned** (Phase 1+), with optimistic updates + refetch on focus ("real time" = optimistic + refetch, no push). *(Not installed yet.)*
- **API**: `VITE_API_URL` (defaults to `http://localhost:8000`). The backend CORS trusts `FRONTEND_ORIGIN`; that's why Vite uses a **fixed port 5173** (`strictPort`): if it's taken, it fails instead of drifting to another port and breaking CORS.
- **Tests**: **Vitest + jsdom + Testing Library**; **MSW** for the route/page seam (planned, mocking the network at the HTTP boundary, without mocking TanStack Query internals). The initial smoke test mocks `@clerk/react`.
- **Build**: `tsc -b && vite build` (typecheck runs as part of the build).

## CI

`.github/workflows/ci.yml`, on `push` to `main` and on `pull_request`. **4 jobs in parallel**:

1. `backend-lint` — `ruff check` + `ruff format --check`.
2. `backend-test` — `pytest` (ephemeral Postgres via testcontainers; `TESTCONTAINERS_RYUK_DISABLED=true`).
3. `frontend-lint` — `eslint` + `tsc -b`.
4. `frontend-test` — `vitest run`.

## Git hooks

- **Husky** installs a **`pre-push`** hook that runs `pnpm lint` (front + back); if a linter fails, the push is aborted.
- It is set up automatically when running `pnpm install` at the root (`prepare: husky` script).
- Skip ad hoc with: `git push --no-verify`.

## Communication

- Be extremely concise. Sacrifice grammar for the sake of concision.

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- If something goes sideways, STOP and re-plan immediately.
- Use plan mode for verification steps, not just building.
- Write detailed specs upfront to reduce ambiguity. For domain/architecture decisions, lean on the `grill-with-docs`, `to-prd` and `to-issues` skills and keep `CONTEXT.md`/ADRs current.

### 2. Subagent Strategy

- Once a plan is approved, prefer routing implementation through subagents. The main thread plans, reviews, and verifies — keeping its own context clean.
- One task per subagent for focused execution. Offload research, exploration, and parallel work too.
- The main thread reviews each subagent's output: runs tests, lint and typecheck, and validates against the plan.
- For complex problems, throw more compute at it via subagents.
- When a task is completed and verified, commit with a clear message (e.g. `feat: <task name>`) plus the project's Devin co-author footer.

### 2b. TDD (non-negotiable)

- Every change is developed test-first: fix existing broken tests or write new ones before implementation. The `tdd` skill is available.
- Test external behavior at the highest seam possible, never implementation details. Use real Postgres (RLS + JSONB), not SQLite or mocks.
- No test debt: if a feature ships, its tests ship with it. No TODOs, no "I'll add tests later".

### 3. Self-Improvement Loop

- After ANY correction from the user: record the pattern in `tasks/lessons.md`.
- Write rules for yourself that prevent the same mistake.
- Ruthlessly iterate on these lessons until the mistake rate drops.
- Review lessons at session start.

### 4. Verification Before Done

- Never mark a task complete without proving it works.
- Run `pnpm lint`, the typecheck and the relevant tests; demonstrate correctness.
- Diff behavior between `main` and your changes when relevant.
- Ask yourself: "Would a staff engineer approve this?"

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution".
- Skip this for simple, obvious fixes — don't over-engineer.
- Challenge your own work before presenting it.

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding.
- Point at logs, errors, failing tests — then resolve them.
- Zero context switching required from the user.
- Go fix failing CI checks without being told how.

## Task Management

1. Plan First: write the plan to `tasks/todo.md` with checkable items.
2. Verify Plan: check in before starting implementation.
3. Track Progress: mark items complete as you go.
4. Explain Changes: high-level summary at each step.
5. Document Results: add a review section to `tasks/todo.md`.
6. Capture Lessons: update `tasks/lessons.md` after corrections.

## Core Principles

- **Simplicity First**: make every change as simple as possible. Impact minimal code.
- **No Laziness**: find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: only touch what's necessary. No side effects with new bugs.
- **Ubiquitous Language**: always use the `CONTEXT.md` terms; respect the ADRs in `docs/adr/` and update them if a decision changes.
- **No secrets in the repo**: `*.env.local` stays gitignored.
