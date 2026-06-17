## Parent

`docs/prd/tandem-fase-1-lista-compra.md`

## What to build

Las correcciones de la lista desde la PWA: **editar** el texto de un Ítem, **borrarlo** (hard delete, corregible) y **limpiar los comprados** de una vez.

`PATCH /api/shopping-items/{id}` actualiza el texto; `DELETE /api/shopping-items/{id}` borra un Ítem; `DELETE /api/shopping-items/bought` elimina todos los Ítems en estado `bought`. La pantalla Compra ofrece editar/borrar por fila y un "limpiar comprados" en la sección Comprado, con optimistic update.

## Acceptance criteria

- [ ] `PATCH .../{id}` edita el texto libre del Ítem; `DELETE .../{id}` lo borra (hard delete).
- [ ] `DELETE .../bought` elimina solo los Ítems comprados de la Familia, dejando los pendientes intactos.
- [ ] La PWA permite editar y borrar un Ítem y limpiar los comprados, con optimistic update + refetch.
- [ ] Todo acotado a la Familia (un Miembro de otra Familia no puede editar/borrar/limpiar estos Ítems).
- [ ] Cubierto por la costura HTTP/REST y la costura de ruta/página con MSW.

## Blocked by

- 01-items-compra-alta-listado.md
