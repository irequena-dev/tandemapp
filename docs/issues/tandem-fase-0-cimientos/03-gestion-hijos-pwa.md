## Parent

`docs/prd/tandem-fase-0-cimientos.md`

## What to build

La gestión completa de Hijos desde la PWA, de extremo a extremo. Un Miembro da de alta un Hijo con su nombre y fecha de nacimiento, lo edita, lo lista y lo elimina. La tabla `children` lleva `family_id` y política RLS; el CRUD REST está acotado a la Familia autenticada; la PWA usa optimistic updates (patrón base reutilizable). La edad del Hijo se deriva de la fecha de nacimiento y se muestra en la UI.

Es la primera funcionalidad de dominio real y ejercita la columna de aislamiento de la rebanada 02 sobre una tabla concreta.

## Acceptance criteria

- [ ] Existe la tabla `children` (`id`, `family_id`, `name`, `birth_date`) con RLS.
- [ ] CRUD REST de Hijos acotado a la Familia: crear, listar, editar, borrar.
- [ ] La PWA permite alta, edición, baja y listado de Hijos.
- [ ] La UI muestra la edad derivada de la fecha de nacimiento.
- [ ] Las operaciones de la lista usan optimistic updates con refetch (patrón base).
- [ ] Un Miembro de otra Familia no ve ni puede modificar estos Hijos (cubierto por la costura de request).
- [ ] Cubierto por las tres costuras: REST, aislamiento, y ruta/página con MSW.

## Blocked by

- 02-aislamiento-rls.md
