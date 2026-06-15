# Issue 05 — Servidor MCP: `list_children` + contrato de matching estricto

`docs/issues/tandem-fase-0-cimientos/05-servidor-mcp-list-children-matching.md` · bloqueada por 03 (Hijos) y 04 (token MCP).

## Decisiones (confirmadas con el usuario)

- **Token vs RLS**: función **SECURITY DEFINER** `resolve_mcp_token(hash)` (migración 0004) que bypassa RLS de forma acotada y auditable para el bootstrap de auth; `tandem_app` sigue sin leer `mcp_tokens` directamente.
- **Rechazo de auth**: **HTTP 401** en una puerta ASGI que envuelve el servidor MCP. Token inválido/revocado → 401 antes de llegar a ninguna tool.
- **Matching**: **solo `list_children`** como tool esta fase; el matching es un **resolver reutilizable** (`resolve_child_by_name`) que las tools de fases siguientes consumirán, testeado directamente contra Postgres real.
- **`secrets.compare_digest`**: el hash presentado se confirma con `compare_digest` frente al hash almacenado (contrato del issue; defensa en profundidad). Documentado en docstring + ADR.
- **Rate limiting**: fuera del código (proxy inverso). Se documenta, no se implementa.

## Arquitectura

- `app/mcp/__init__.py` — paquete (lo crea el hilo principal).
- `app/mcp/auth.py` — `extract_bearer(headers)`, `resolve_token(session, presented) -> (member_id, family_id) | None`.
- `app/mcp/child_matching.py` — `ChildMatchError` (razón + Hijos válidos) + `resolve_child_by_name(session, name) -> Child | ChildMatchError`.
- `app/mcp/server.py` — servidor FastMCP con la tool `list_children` + puerta ASGI `with_bearer_auth(...)`.
- `app/main.py` — monta el servidor MCP (con puerta) en `/mcp`.
- `alembic/versions/0004_resolve_mcp_tokens_function.py` — `resolve_mcp_token(text) RETURNS TABLE(member_id, family_id)` `SECURITY DEFINER STABLE` + `GRANT EXECUTE TO tandem_app`.

## Plan TDD vertical (un test → una impl → repetir), por subagente

### Ronda 1 (paralela; cada pytest levanta su propio Postgres efímero)
- **Subagente A — auth**: migración 0004 + `auth.py` + `tests/test_mcp_auth.py`.
  Behaviors: token válido resuelve (member,family); revocado → None; desconocido → None; ausente → None.
- **Subagente B — matching**: `child_matching.py` + `tests/test_child_matching.py`.
  Behaviors: match exacto → Child; case-insensitive → Child; sin match → `ChildMatchError(reason="not_found")` con Hijos válidos; ambiguo → `reason="ambiguous"` con Hijos válidos.

### Ronda 2 (tras verificar A)
- **Subagente C — servidor MCP**: `server.py` (FastMCP + tool + puerta ASGI) + montaje en `main.py` (añade dep `fastmcp`) + `tests/test_mcp_server.py`.
  Behaviors: sin Bearer → 401; Bearer inválido → 401; Bearer revocado → 401; Bearer válido → `list_children` devuelve SOLO los Hijos de la Familia del token (tracer bullet: clavar el transporte MCP primero); aislamiento entre Familias.

### Cierre (hilo principal)
- ADR-0006 (contrato de matching estricto) + nota de rate-limiting-en-proxy + docstrings.
- `pnpm test:backend` + `pnpm lint` verdes. Commit `feat: servidor MCP list_children + matching estricto (issue 05)`.

## Costuras de test (Postgres real, sin mocks/SQLite)

- **auth**: sembrar token vía REST `POST /mcp-tokens` (plaintext + family); `resolve_token(app_session, plaintext)`.
- **matching**: sembrar Hijos vía REST; `resolve_child_by_name` sobre `app_session` con la variable de Familia fijada.
- **MCP**: `httpx` + `ASGITransport` contra la app; sembrar token+Hijos vía REST; invocar `list_children` con `Authorization: Bearer`. Casos de rechazo = 401 directo (sin JSON-RPC).

## Verificación
- [x] Ronda 1: auth 9 pass + matching 4 pass.
- [x] Ronda 2: costura MCP 6 pass (401×3, list_children exacto+orden, aislamiento).
- [x] `pnpm test:backend` → **37 passed** (31 previos + 6 MCP; auth y matching ya sumados). Cadena `0001→0002→0003→0004` limpia.
- [x] `pnpm lint:backend` (ruff check + format) → verde.
- [x] ADR-0006 (contrato de matching) + nota de rate-limiting-en-proxy escritas.

## Review

Hecho y verificado de extremo a extremo (TDD vertical por subagentes, hilo orquestador re-ejecuta en verde). Criterios de aceptación cubiertos:

- **Servidor MCP montado y accesible como endpoint Bearer**: `app/mcp/server.py` (FastMCP) montado en `/mcp` (`app.main`); puerta ASGI `with_bearer_auth` exige `Authorization: Bearer` y devuelve **401 real** si falla, antes de llegar a ninguna tool.
- **Token validado con `secrets.compare_digest`; inválido/revocado rechazado**: `app/mcp/auth.resolve_token` hashea el token, lo resuelve vía `resolve_mcp_token` (SECURITY DEFINER) y confirma con `compare_digest`; revocados/desconocidos → 401.
- **Token → Miembro → Familia + contexto RLS**: `resolve_token` devuelve `(member_id, family_id)`; la tool `list_children` fija `app.current_family_id` (SET LOCAL) antes de leer.
- **`list_children` devuelve SOLO los Hijos de la Familia del token**: cubierto + aislamiento entre Familias (test e).
- **Contrato de matching estricto implementado y documentado**: `app/mcp/child_matching.resolve_child_by_name` (exacto case-insensitive; `ChildMatchError` con razón + Hijos válidos); ADR-0006. Es un resolver reutilizable (la única tool de esta fase es `list_children`); testeado directamente contra Postgres (decisión confirmada).
- **Costura MCP (auth, aislamiento, matching) contra Postgres real**: tests `test_mcp_server.py` (auth+aislamiento vía la costura `/mcp`), `test_child_matching.py` (error de matching a nivel resolver).

### Piezas
- Migración `0004`: `resolve_mcp_token(hash) RETURNS TABLE(member_id, family_id, token_hash)` SECURITY DEFINER STABLE + GRANT EXECUTE a `tandem_app`. Único bypass de RLS, acotado y auditable, para el bootstrap de auth (el runtime corre como `tandem_app` NOSUPERUSER; la función es del owner superuser).
- `app/mcp/auth.py`: `extract_bearer` + `resolve_token` (hash + función + `secrets.compare_digest` como defensa en profundidad).
- `app/mcp/child_matching.py`: contrato estricto (`ChildMatchError(reason, valid_children)` + `resolve_child_by_name`).
- `app/mcp/server.py`: FastMCP + `list_children` (lee identidad del `scope["state"]` que fija la puerta; transacción propia con RLS) + `with_bearer_auth` (401 ASGI real) + `build_mcp_app`.
- `app/main.py`: monta `/mcp` y pasa el lifespan de FastMCP a la app.

### Transporte en test
FastMCP `Client` sobre `StreamableHttpTransport` puenteado a la app ASGI en proceso (`httpx_client_factory` + `ASGITransport`); como `ASGITransport` no arranca lifespan, un helper `_lifespan` de test dispara manualmente startup/shutdown. Solo test scaffolding. Endpoint canónico `/mcp/` (POST a `/mcp` → 307 que el cliente sigue).

### Fuera de alcance (futuro)
- Tools de escritura por MCP y su uso del resolver de matching (fases 1–4).
- Rate limiting (proxy) y expiración automática de tokens.
- Deduplicar la resolución del token (puerta + tool leen de `scope["state"]`; ya es una sola resolución).
