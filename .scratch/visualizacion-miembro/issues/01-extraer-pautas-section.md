## Parent

`.scratch/visualizacion-miembro/PRD.md`

## What to build

Extraer `PautasSection` (hoy embebida en `HijoDetailPage`) a un componente compartido en `features/pautas/PautasSection.tsx`, parametrizado por tipo de sujeto (`child` | `member`). El componente filtra Pautas por `child_id` o `member_id` según el tipo, muestra activas (ordenadas por `next_dose_at`) + finalizadas colapsables, e incluye el formulario de creación con sujeto preseleccionado. `HijoDetailPage` pasa a importar el componente extraído en su tab "Pautas" con `subjectType: 'child'`. Pure refactor — sin cambios de comportamiento.

## Acceptance criteria

- [ ] `PautasSection` existe como componente independiente en `features/pautas/` con props `subjectId`, `subjectType`, `subjectName`, `pautas`, `visits`, `children`, `members`
- [ ] `HijoDetailPage` usa el componente extraído en su tab "Pautas" — comportamiento idéntico al anterior
- [ ] `HijoDetailPage.test.tsx` pasa sin modificaciones (regresión guard)
- [ ] `PautasSection.test.tsx` cubre filtrado por `child` (activas, finalizadas, formulario con sujeto preseleccionado)
- [ ] `PautasPage` no se ve afectada — `PautasPage.test.tsx` pasa sin cambios

## Blocked by

None - can start immediately
