## Parent

`docs/prd/tandem-fase-1-lista-compra.md`

## What to build

La rebanada base de la lista de la compra de extremo a extremo: una **lista única por Familia** que un Miembro puede ver y a la que puede **añadir** Ítems de texto libre desde la PWA.

La tabla `shopping_items` lleva `family_id` y política RLS (patrón de la Fase 0); el REST expone listar y crear, acotados a la Familia autenticada; la pantalla **Compra** lista los Ítems pendientes y permite añadir uno nuevo con **optimistic update** + refetch al enfocar.

Por ser el **tracer bullet**, esta rebanada fija el *prior art* de las tres costuras (REST, MCP, ruta de frontend) que imitan las Fases 2–4. Esquema y tipos en `docs/api-contract.md` §3.

## Acceptance criteria

- [ ] Existe la tabla `shopping_items` (`id`, `family_id`, `text`, `status`, `created_by`, `created_at`, `updated_at`) con RLS.
- [ ] `GET /api/shopping-items` devuelve los Ítems de la Familia; `POST /api/shopping-items` crea un Ítem `pending` con texto libre.
- [ ] La pantalla Compra lista los Ítems pendientes y permite añadir uno desde la PWA con optimistic update + refetch al enfocar.
- [ ] Un Miembro de otra Familia no ve ni puede crear Ítems en esta lista (aislamiento por RLS).
- [ ] Cubierto por la costura HTTP/REST (Postgres real) y la costura de ruta/página con MSW (sin mockear TanStack Query por dentro).

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
