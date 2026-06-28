# Backend conventions

- **FastAPI + uv** (Python 3.12), **SQLModel** (SQLAlchemy + Pydantic) + **asyncpg** over **PostgreSQL**. Async end to end.
- Structure under `app/`: `config.py`, `database.py`, `auth.py`, `tenancy.py` (isolation), `models.py` (SQLModel), `api/` (routers), `mcp/` (remote MCP server). Exposes the **REST API** (PWA) and the remote **MCP server** (mounted at `/mcp`, FastMCP).
- **Lint/format**: `ruff` (configured in `pyproject.toml`; `B008` is ignored because `Depends()` in defaults is the idiomatic FastAPI pattern).

## Auth

- **REST**: verifies the Clerk JWT with the official `clerk-backend-api` SDK (`authenticate_request`, networkless via JWKS). Actions are attributed to the Miembro.
- **MCP**: `Authorization: Bearer <token>` per Miembro (ADR-0001); an ASGI gate resolves the token → Miembro → Familia via the `resolve_mcp_token` SECURITY DEFINER function (the only deliberate RLS bypass, for the auth bootstrap) and returns **401** on invalid/revoked tokens before any tool runs. Each tool opens its own transaction and sets `app.current_family_id` (SET LOCAL) so RLS applies. Strict Hijo matching (`resolve_child_by_name`) and rate limiting (reverse proxy, ADR-0006) are documented contracts reused by later phases.

## Multi-tenancy (defense in depth)

- Every family-scoped table carries `family_id`; isolation is app-layer filtering + **RLS** as the net.
- The single entry point is `tenancy.family_session`: per transaction it materializes the Clerk identity into `families`/`members` and fixes `app.current_family_id` via `set_config(..., true)` (= `SET LOCAL`); RLS policies compare against it. **Never set the family variable ad hoc in handlers — always depend on `family_session`.**
- **Critical**: the runtime connects as `tandem_app` (NOSUPERUSER) because a superuser/owner bypasses RLS even with `FORCE`.

## Migrations

- **Alembic** (async, URL injected from `Settings.database_url`). The initial migration creates `families`/`members`, enables RLS (`FORCE`) with per-`family_id` policies, and creates the `tandem_app` NOSUPERUSER role with DML grants + default privileges. Run via `pnpm db:migrate`.

## NLP boundary (ADR-0002)

- The backend does **not** interpret natural language. Claude (the MCP client) picks the intent and extracts structured data; the backend validates (Pydantic) and persists.
