## Parent

`docs/prd/tandem-fase-0-cimientos.md`

## What to build

La columna vertebral del aislamiento multi-inquilino. Al autenticarse, la identidad de Clerk se materializa en las tablas `families` y `members` (la Familia espeja la Organización; el Miembro espeja el usuario y pertenece a exactamente una Familia). Cada transacción fija la variable de sesión de Familia (`SET LOCAL`) a partir del contexto autenticado, y PostgreSQL aplica **RLS** como red de seguridad además del filtrado en la capa de aplicación (defensa en profundidad, ADR de seguridad del PRD).

El objetivo demostrable es que una Familia nunca puede ver ni modificar datos de otra, y que la base de datos deniega el acceso si la variable de Familia no está fijada.

## Acceptance criteria

- [ ] La identidad de Clerk se persiste en `families` y `members` (un Miembro → una Familia).
- [ ] La variable de sesión de `family_id` se fija por transacción desde el contexto autenticado.
- [ ] RLS está activado y, con dos Familias distintas, los datos de una no son visibles ni modificables desde la otra (verificado en la costura de request).
- [ ] Un test de sesión de DB confirma que RLS deniega el acceso cuando la variable de Familia no está fijada.
- [ ] El mecanismo de inyección de `family_id` está centralizado (no repetido ad hoc en cada handler).

## Blocked by

- 01-esqueleto-auth-clerk.md
