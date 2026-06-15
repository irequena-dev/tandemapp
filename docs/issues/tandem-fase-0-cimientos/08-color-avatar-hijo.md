## Parent

`docs/prd/tandem-fase-0-cimientos.md`

## What to build

Añadir un **color de avatar** al Hijo, de forma **incremental** sobre la gestión de Hijos ya entregada (issue 03). El avatar del Hijo pasa a ser **inicial + color**, consistente en la PWA (roster de Ajustes, card de Hijos y, más adelante, filas de Pautas).

Es un cambio aditivo: nueva columna `avatar_color` en `children` (nullable), exposición en el contrato REST de alta/edición, y selector de color con preview en el formulario de Hijo dentro de **Ajustes**. La paleta es un **conjunto acotado** alineado con el sistema de diseño (`DESIGN.md` / `.impeccable/design.json`), verificado a AA en claro y oscuro. Los Hijos existentes sin color usan un **fallback determinista** derivado de su `id` (sin backfill de datos).

## Acceptance criteria

- [ ] Migración nueva (la siguiente revisión libre, `0005`, sobre `0004`) que añade `children.avatar_color` **nullable** (texto/clave de la paleta), reversible en `downgrade`. No requiere backfill.
- [ ] Modelo SQLModel y esquemas `ChildCreate`/`ChildUpdate` aceptan `avatar_color` opcional; el backend valida que el valor pertenece a la **paleta acotada** (rechaza valores fuera de ella).
- [ ] El CRUD REST de Hijos persiste y devuelve `avatar_color`; sigue acotado a la Familia (RLS intacta).
- [ ] En **Ajustes → Hijos**, el formulario de alta/edición incluye un **selector de color** con **preview del avatar** (inicial + color).
- [ ] La UI muestra el avatar (inicial + color) en el roster y el card de Hijo; si `avatar_color` es `null`, aplica el **fallback determinista** por `id`.
- [ ] Cubierto por las tres costuras: REST (crear/editar con color válido e inválido), aislamiento por Familia, y ruta/página con MSW (elegir color y ver el preview/avatar).

## Blocked by

- 03-gestion-hijos-pwa.md
