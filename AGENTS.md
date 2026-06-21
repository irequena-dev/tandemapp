# AGENTS.md — Tándem

Platform to share the logistical mental load of parenting and the home among the Miembros of a Familia: hands-free voice input (via Claude/MCP) and fast visual consultation in a PWA.

**Monorepo** — **backend** FastAPI (`/backend`, Python 3.12 + **uv**) + **frontend** React 19 (`/frontend`, Vite + TypeScript). Use **pnpm** from the root for everything (never npm); use **uv** for Python.

## Essentials

- **Lint**: `pnpm lint` · **Typecheck**: `pnpm -C frontend exec tsc -b` · **Tests**: `pnpm test:frontend`, `pnpm test:backend` (needs Docker) · **Dev**: `pnpm dev`.
- **TDD is non-negotiable**: write the failing test first, then implement — including bug fixes. See [testing](docs/agents/testing.md).
- **Plan features, autofix bugs**: plan & check in for new features/architecture; fix bug reports and failing CI autonomously. See [workflow](docs/agents/workflow.md).
- **Ubiquitous language is Spanish** (Familia, Miembro, Hijo, Medida, Talla, Ítem de compra, Evento, Serie, Tipo de Evento, Visita médica, Pauta, Administración) — keep these terms in Spanish even in English prose. Display brand = **"Tándem"**; technical slug (code, dirs, DB) = **`tandem`**.
- **Never read or print `*.env.local`** (secrets).
- Be extremely concise. Sacrifice grammar for the sake of brevity.

## Domain docs (source of truth — read at session start)

- `CONTEXT.md` — glossary of the ubiquitous language.
- `docs/adr/` — architecture decisions (respect them).
- `docs/prd/tandem-plataforma-mvp.md` — roadmap by phases (each phase has its own PRD).
- `docs/issues/` — work sliced into vertical tracer bullets.
- `PRODUCT.md` / `DESIGN.md` — strategic + visual design context (for any UI work).

## Detailed guidance

| Topic | File |
| --- | --- |
| Setup & environment variables | [docs/agents/setup.md](docs/agents/setup.md) |
| Commands reference | [docs/agents/commands.md](docs/agents/commands.md) |
| Backend conventions (FastAPI, RLS, MCP) | [docs/agents/backend.md](docs/agents/backend.md) |
| Frontend conventions (React, Clerk, PWA) | [docs/agents/frontend.md](docs/agents/frontend.md) |
| Testing & TDD | [docs/agents/testing.md](docs/agents/testing.md) |
| CI & Git workflow | [docs/agents/ci-and-git.md](docs/agents/ci-and-git.md) |
| Workflow & principles | [docs/agents/workflow.md](docs/agents/workflow.md) |

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature-slug>/` (local-markdown tracker; no PR triage surface). See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles with default label strings: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
