# CI & Git

## CI

`.github/workflows/ci.yml`, on `push` to `main` and on `pull_request`. **4 jobs in parallel**:

1. `backend-lint` — `ruff check` + `ruff format --check`.
2. `backend-test` — `pytest` (ephemeral Postgres via testcontainers; `TESTCONTAINERS_RYUK_DISABLED=true`).
3. `frontend-lint` — `eslint` + `tsc -b`.
4. `frontend-test` — `vitest run`.

## Git hooks (Husky)

- A **`pre-push`** hook runs `pnpm lint` (front + back); if a linter fails, the push is aborted.
- Set up automatically by `pnpm install` at the root (`prepare: husky` script).
- Skip ad hoc with: `git push --no-verify`.

## Commits

- When a task is completed and verified, commit with a clear message (e.g. `feat: <task name>`) plus the project's Devin co-author footer.
