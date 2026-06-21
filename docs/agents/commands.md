# Commands

Everything via **pnpm** from the root (never npm).

| Task                                    | Command                        |
| --------------------------------------- | ------------------------------ |
| Full dev (DB + back + front)            | `pnpm dev`                     |
| Frontend only                           | `pnpm dev:frontend`            |
| Backend only                            | `pnpm dev:backend`             |
| Start the dev DB                        | `pnpm db`                      |
| Apply DB migrations (Alembic)           | `pnpm db:migrate`              |
| Full lint (front + back)                | `pnpm lint`                    |
| Frontend lint (eslint)                  | `pnpm lint:frontend`           |
| Backend lint (ruff check + format)      | `pnpm lint:backend`            |
| Frontend tests (vitest)                 | `pnpm test:frontend`           |
| Backend tests (pytest + testcontainers) | `pnpm test:backend`            |
| Frontend typecheck                      | `pnpm -C frontend exec tsc -b` |

`pnpm dev` brings up, in order: dev DB → DB migrations → frontend (Vite, `localhost:5173`) → backend (FastAPI, `localhost:8000`).
