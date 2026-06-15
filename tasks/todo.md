# Issue 04 — Ciclo de vida del token MCP por Miembro

`docs/issues/tandem-fase-0-cimientos/04-token-mcp-ciclo-vida.md` · bloqueada por 02 (RLS).

## Decisiones (confirmadas con el usuario)

- **Alcance UI**: backend + capa de datos (hooks/tipos) + **shell funcional sin estilar** + tests MSW. El estilado lo hace el usuario (igual que en la 03).
- **Política de tokens**: **múltiples tokens activos** por Miembro; revocación por `id` independiente. (Rotación = crear nuevo + revocar viejo.)
- **Hashing**: SHA-256 del token de alta entropía (≥32 bytes); el valor en claro se devuelve una sola vez y nunca se persiste.

## Plan (TDD vertical, un test → una impl → repetir)

### Backend
- [x] Migración `0003_mcp_tokens_rls`: tabla `mcp_tokens` (`id`, `member_id`, `family_id`, `token_hash`, `created_at`, `revoked_at`) + su propia política RLS `family_isolation`.
- [x] `app/tokens.py`: `generate_token()` (≥32 bytes, prefijo `tdm_live_`) + `hash_token()` (sha256 hex).
- [x] `tenancy.current_member_id`: dependencia que da el Miembro del contexto.
- [x] Modelo `McpToken` + schemas `McpTokenCreated`/`McpTokenOut`.
- [x] Router `app/api/mcp_tokens.py`: `POST/GET /mcp-tokens`, `DELETE /mcp-tokens/{id}` (soft revoke).
- [x] Tests (Postgres real): generar (valor en claro + ≥32 bytes + solo hash en BD); listado sin secreto; revocar; aislamiento por Miembro en la misma Familia; aislamiento entre Familias (RLS); 403 sin Familia.

### Frontend (capa de datos + shell)
- [x] `features/mcp-tokens/{types,api}.ts`: `useMcpTokens`, `useCreateMcpToken`, `useRevokeMcpToken` (optimista + rollback).
- [x] `api.test.tsx` (MSW): listar, crear (devuelve token + reconcilia), revocar (optimista + rollback).
- [x] `McpTokenPanel.tsx` (shell sin estilar) + ruta `/ajustes/token` + nav link.

### Refactor (en verde)
- [x] Revisado: `tokens.py` es módulo profundo; patrón optimista duplicado con children/api.ts se deja local (minimal impact).

## Verificación

- [x] `pnpm test:backend` → **18 passed** (12 previos + 6 nuevos). Cadena `0001→0002→0003` aplica limpia.
- [x] `pnpm test:frontend` → **17 passed** (13 previos + 4 nuevos).
- [x] `pnpm lint` (ruff + eslint) + `pnpm -C frontend exec tsc -b` → verde.

## Review

Hecho y verificado de extremo a extremo (TDD vertical). Criterios de aceptación cubiertos:
tabla `mcp_tokens` con hash + metadatos de revocación; generar (valor en claro una vez, ≥32 bytes);
almacenado solo como hash; revocar (soft, `revoked_at`); acotado a Familia (RLS) **y** Miembro (filtro app-layer,
dimensión nueva frente a Hijos); costura REST (ASGI + Postgres real) + costura ruta/página (MSW).

### Backend
- `app/tokens.py`: `generate_token`/`hash_token` (sha256). Prefijo `tdm_live_`; `secrets.token_urlsafe(32)` (32 bytes entropía).
- `tenancy.current_member_id` (= `claims["sub"]`); FastAPI cachea `require_auth` por petición.
- `models.McpToken` + `McpTokenCreated` (lleva el valor en claro) / `McpTokenOut` (metadata solo). `created_at`/`revoked_at` como `DateTime(timezone=True)` (UTC).
- Router: `POST` (genera + hashea + devuelve claro una vez), `GET` (filtra por `member_id`, `response_model` deja caer hash), `DELETE` (soft revoke; 404 si no existe o no es tuyo).
- Tests: valor en claro una vez + ≥32 bytes + en BD solo hash; GET sin `token`/`token_hash`; revoke → `revoked_at`; per-Miembro en misma Familia (B no ve/revoca A, 404); RLS entre Familias (404); 403 sin Familia.

### Frontend
- `features/mcp-tokens/{types,api}.ts`: hooks con optimistic update + rollback (mismo patrón que Hijos, claves propias).
- `api.test.tsx` (MSW): 4 tests cubren listar, crear (token + reconciliación), revocar optimista y rollback.
- `McpTokenPanel.tsx`: shell funcional en estilos inline sobre tokens `--ds` (autocontenido, sin acoplarse a `children.css`); muestra el token una vez con copiar + aviso; lista metadata + estado; revocación con confirmación inline.
- Ruta `/ajustes/token` + enlace "Token MCP" en el nav.

### Fuera de alcance (issue 05 / futuro)
- Lookup/uso del token para autenticar el servidor MCP (sin índice de hash, sin endpoint de verificación).
- Rate limiting, expiración automática.
- Estilado visual del panel (pase del usuario).
- Deduplicar el helper optimista con `children/api.ts` (tocaría la feature Hijos).
