# Issue 03 — Gestión de Hijos (PWA, extremo a extremo)

`docs/issues/tandem-fase-0-cimientos/03-gestion-hijos-pwa.md`

## Decisiones (confirmadas con el usuario)

- **Reparto de trabajo**: Devin hace **backend** + la **capa de datos del frontend** (TanStack Query, hooks, optimistic updates, MSW). El usuario hace la **parte visual** con `impeccable`.
- **Frontend boundary**: capa de datos + **headless page shell** (componente sin estilar que cablea los hooks; el usuario lo reestiliza).
- **Routing**: se añade **react-router** ahora; ruta `/ajustes/hijos`.
- **Test seam frontend**: **hooks-level con MSW** (TanStack Query real, red mockeada en la frontera HTTP).

## Plan

### Backend
- [ ] Modelo SQLModel `Child` (tabla `children`: `id` UUID, `family_id`, `name`, `birth_date`).
- [ ] Migración `0002`: crea `children` + **su propia** política RLS `family_isolation` sobre `family_id` (grants DML heredados por default privileges).
- [ ] Dependencia `current_family_id` (deriva de los claims) para fijar `family_id` en el alta sin que el handler toque la variable de sesión.
- [ ] Router `children`: `POST /children`, `GET /children`, `PATCH /children/{id}`, `DELETE /children/{id}`, todo vía `family_session`.
- [ ] Tests (Postgres real): CRUD por la costura REST; aislamiento (Familia B no ve ni modifica Hijos de A → 404/lista vacía).

### Frontend (capa de datos + shell)
- [ ] Instalar `@tanstack/react-query`, `react-router`, `msw`.
- [ ] `QueryClient` base reutilizable (optimistic + refetch al enfocar) + providers en `main.tsx` + router.
- [ ] Cliente API con token de Clerk + tipos `Child` + util de edad (con tests).
- [ ] Hooks de Hijos con **optimistic updates** (patrón base reutilizable).
- [ ] Setup de MSW + tests hooks-level del CRUD.
- [ ] `ChildrenPage` headless + ruta `/ajustes/hijos` (para reestilar).

### Verificación
- [ ] `pnpm lint`, typecheck frontend, `pnpm test:frontend` en verde.
- [ ] `pnpm test:backend` (requiere Docker; **bloqueado localmente**, daemon caído → confiar en CI / ejecución del usuario).

## Review

Hecho (backend + capa de datos frontend). Verificado: `pnpm lint` (front + back) y
typecheck frontend en verde; **13 tests frontend** en verde. Tests backend escritos
pero **no ejecutados localmente** (daemon Docker caído) → CI.

### Backend
- Modelo `Child` (tabla `children`: `id` UUID, `family_id`, `name`, `birth_date`) en `app/models.py`,
  con `ChildCreate`/`ChildUpdate`.
- Migración `0002_children_rls`: crea `children`, índice por `family_id`, RLS + FORCE y política
  propia `family_isolation` por `app.current_family_id`. Grants DML heredados de las default
  privileges de la 0001 (mismo owner crea la tabla). Cadena `0001 -> 0002` verificada.
- `tenancy.current_family_id`: nueva dependencia que da el `family_id` del contexto; `family_session`
  ahora la reutiliza (sin duplicar el 403). El alta fija `family_id` desde ahí (cumple el WITH CHECK).
- Router `app/api/children.py`: `POST/GET /children`, `PATCH/DELETE /children/{id}`, todo vía
  `family_session`. La edición/baja cargan con `session.get`; RLS oculta Hijos de otra Familia → 404.
- Tests (`tests/test_children.py`): CRUD por la costura REST, aislamiento entre Familias (B no ve ni
  modifica → 404, A intacto) y 403 al crear sin Familia.

### Frontend (capa de datos + shell headless)
- Deps: `@tanstack/react-query`, `react-router`, `msw` (dev). pnpm v11 ya no lee `package.json#pnpm`:
  config en `frontend/pnpm-workspace.yaml` (`allowBuilds: { msw: false }`) para no fallar en install.
- `lib/queryClient.ts` (config base reutilizable: refetch al enfocar + staleTime), `lib/api.ts`
  (cliente fetch con token de Clerk + `ApiError`).
- `features/children/`: `types.ts`, `age.ts` (`calculateAge`/`formatAge`, con tests), `api.ts`
  (hooks `useChildren`/`useCreateChild`/`useUpdateChild`/`useDeleteChild` con **optimistic updates**
  + rollback como patrón base reutilizable), `ChildrenPage.tsx` (shell **sin estilar** para reestilar).
- Providers en `main.tsx` (QueryClientProvider + BrowserRouter) y ruta `/ajustes/hijos` en `App.tsx`
  (+ enlace en el Header).
- Test seam: `test/server.ts` + `test/setup.ts` (MSW `setupServer`, `onUnhandledRequest: 'error'`,
  polyfill de `matchMedia`); `features/children/api.test.tsx` (CRUD + optimista + rollback) y
  `age.test.ts`.

### Notas / handoff al usuario (parte visual)
- **Boundary**: reestila `features/children/ChildrenPage.tsx` (lógica ya cableada) y, si quieres, el
  enlace "Hijos" del Header en `App.tsx`. No toco más visuales.
- **Smoke test ajeno tocado**: `src/App.test.tsx` estaba **rojo en main** (jsdom sin `matchMedia` +
  mock de Clerk sin `SignIn`/`SignUp` + copy antiguo tras tu rediseño de `SignInPage`). Lo dejé verde:
  añadí `SignIn`/`SignUp` al mock y apunté la aserción a "Comparte la carga mental de la crianza".
  Si cambias ese copy, actualiza esa aserción.
- **Backend tests**: ejecútalos con Docker arriba (`pnpm test:backend`) o confía en CI.
- **Sin commit todavía**: como estás trabajando en paralelo en los visuales, no he hecho commit.
