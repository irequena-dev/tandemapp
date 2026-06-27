---
name: testing-e2e-tandem
description: End-to-end GUI testing of the Tándem PWA. Use when verifying UI features, form flows, or CRUD operations against the local dev stack.
---

# End-to-End Testing — Tándem

## When to use

Use this skill when testing UI features end-to-end against the local dev stack (frontend + backend + DB). Covers form submissions, navigation, toast notifications, empty states, and optimistic updates.

## Prerequisites

### Devin Secrets Needed

- `VITE_CLERK_PUBLISHABLE_KEY` — Clerk publishable key (starts with `pk_test_...`). Set in `frontend/.env.local`.
- `CLERK_SECRET_KEY` — Clerk secret key (starts with `sk_test_...`). Set in `backend/.env.local`.

### Environment Setup

1. **DB**: Run `bash scripts/dev-db.sh` to start PostgreSQL container (port 5544, credentials `tandem:tandem`).
2. **Migrations**: `cd backend && uv run alembic upgrade head`
3. **Backend**: `pnpm -C backend dev` (port 8000). Needs `backend/.env.local` with `DATABASE_URL`, `CLERK_SECRET_KEY`, `APP_DB_PASSWORD`, `FRONTEND_ORIGIN`.
4. **Frontend**: `pnpm -C frontend dev` (port 5173). Needs `frontend/.env.local` with `VITE_CLERK_PUBLISHABLE_KEY`.

**Important**: If `VITE_CLERK_PUBLISHABLE_KEY` is also set as a shell env var (e.g. from `request_secret`), Vite will use the shell var over `.env.local`. If the shell var contains a PEM key instead of `pk_test_...`, Clerk JS will fail to load. Fix: `unset VITE_CLERK_PUBLISHABLE_KEY` and restart Vite.

### Clerk Test Login

- Email: `test+clerk_test@example.com`
- Verification code: `424242`
- Flow: Enter email → click "Continuar" → enter code `424242` → signed in.

## Test Data Setup

The DB might be empty after migrations. To test features that need data:

1. **Create Hijo**: Go to Ajustes (gear icon) → Hijos section → "Añadir Hijo" → fill name + date of birth (navigate calendar back for past dates) → click "Añadir".
2. **Create Visita**: Go to `/hijos/:id` → Visitas tab → "+ Visita" → fill form.
3. No seed script exists in the repo — all test data must be created via UI or API.

## Testing Approach

1. **Write adversarial test plan first** — for each assertion, ask: "would this same sequence look identical if the change were broken?" If yes, redesign.
2. **Use concrete expected values** — not "it should work" but "toast should contain 'Pauta de Dalsy creada'".
3. **Test from UI** — bias towards clicking buttons and filling forms rather than curl/API calls. The user watches recordings.
4. **Maximize browser before recording** — `sudo apt-get install -y wmctrl 2>/dev/null; wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`
5. **Annotate recordings** with setup/test_start/assertion markers.

## Welcome Modal

A "¡Bienvenido a Tándem!" modal may appear on page navigation asking for the user's name. Dismiss it by clicking "Ahora no" before proceeding with tests. It may reappear on full-page navigation (address bar reload) but not on SPA navigation (clicking nav links).

## Common Patterns

- **FAB buttons**: Circular floating button at bottom-right (e.g. PautasPage, EventosPage). Click to toggle inline form.
- **Section add buttons**: "+ Visita", "+ Pauta" in HijoDetailPage section headers. Click to show inline form.
- **Toast notifications**: Appear at bottom of screen after successful actions. Format: "Pauta de {medication} creada", "Evento creado", etc.
- **Empty states**: Each section has unique empty state text that changes when the feature allows direct creation vs. requiring another flow.

## Troubleshooting

- **Blank beige page**: Clerk JS failed to load. Check `VITE_CLERK_PUBLISHABLE_KEY` — must be `pk_test_...` format, not a PEM key. Check shell env vars vs `.env.local` precedence.
- **Backend 401/403**: `CLERK_SECRET_KEY` might be wrong or backend not restarted after setting it.
- **Port conflicts**: Kill orphaned processes with `fuser -k 5173/tcp` / `fuser -k 8000/tcp` before restarting servers.
- **DB connection errors**: Verify container is running (`docker ps | grep tandem-dev-db`) and credentials match (`tandem:tandem@localhost:5544/tandem`).
