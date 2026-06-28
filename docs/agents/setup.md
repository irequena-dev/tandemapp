# Setup & environment

- Requirements: **pnpm**, **uv** and **Docker**.
- Environment variables live in `*.env.local` files (gitignored). **Do not read or print them** — they contain secrets.
  - `frontend/.env.local`: `VITE_CLERK_PUBLISHABLE_KEY` and, optionally, `VITE_API_URL` (defaults to `http://localhost:8000`).
  - `backend/.env.local`: `CLERK_SECRET_KEY` (via `clerk env pull`), `DATABASE_URL` (async, `postgresql+asyncpg://...`; the **owner/admin** connection used by Alembic migrations), `FRONTEND_ORIGIN` (defaults to `http://localhost:5173`) and optionally `APP_DB_PASSWORD` (defaults to `tandem_app`). The runtime connects as the **`tandem_app`** role (NOSUPERUSER), derived from `DATABASE_URL` + `APP_DB_PASSWORD`, so RLS actually applies.
- Development Postgres runs in Docker (`tandem-dev-db`, port 5544), managed by `scripts/dev-db.sh` (idempotent). `pnpm dev` starts it automatically.
- Fresh start: `pnpm install` (root) + `pnpm -C frontend install`.
