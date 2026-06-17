## Parent

`docs/prd/tandem-fase-1-lista-compra.md`

## What to build

Marcar un Ítem como **comprado** y **deshacerlo**, conservando el Ítem (no se borra) y registrando **quién** lo compró para coordinarse entre Miembros.

`POST /api/shopping-items/{id}/buy` fija `status=bought`, `bought_by` (Miembro del JWT) y `bought_at`; `POST /api/shopping-items/{id}/undo` revierte a `pending` y limpia `bought_by`/`bought_at`. La pantalla Compra muestra la sección **"Comprado"** (agrupada/colapsada, separada de "Por comprar"), con **quién lo compró** y la acción de **deshacer**, todo con optimistic update.

## Acceptance criteria

- [ ] `POST .../buy` marca `bought`, fija `bought_by`/`bought_at` y conserva el Ítem; `POST .../undo` vuelve a `pending` y limpia la atribución.
- [ ] El listado devuelve pendientes + comprados; el frontend los agrupa en "Por comprar" y "Comprado".
- [ ] La fila comprada muestra quién lo compró (`bought_by`) y ofrece deshacer; tachar/deshacer usan optimistic update + refetch.
- [ ] La atribución usa el Miembro del JWT, no un valor del cliente.
- [ ] Cubierto por la costura HTTP/REST (verificando conservación y atribución) y la costura de ruta/página con MSW.

## Blocked by

- 01-items-compra-alta-listado.md
