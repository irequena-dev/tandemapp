## Parent

`.scratch/visualizacion-miembro/PRD.md`

## What to build

Renombrar la pestaña "Hijos" del Shell a "Familia" y crear `FamiliaTabPage` que lista Hijos y Miembros en dos secciones separadas. La sección Hijos mantiene las tarjetas existentes (nombre, edad, métricas, link a `/hijos/:childId`). La sección Miembros muestra tarjetas con nombre, avatar (anagrama) y "Tú" si es el Miembro autenticado, con link a `/miembros/:memberId`. Cada sección tiene su propio empty state. Nueva ruta `/familia` como landing de la pestaña.

## Acceptance criteria

- [ ] Shell: pestaña renombrada a "Familia" con ruta `/familia`
- [ ] `FamiliaTabPage` muestra dos secciones con headers: "Hijos" y "Miembros"
- [ ] Sección Hijos: tarjetas con nombre, edad, métricas, link a `/hijos/:childId` (igual que antes)
- [ ] Sección Miembros: tarjetas con nombre, avatar (anagrama), "Tú" si es el Miembro autenticado, link a `/miembros/:memberId`
- [ ] Empty state de Hijos: "Aún no hay Hijos en la Familia"
- [ ] Empty state de Miembros: "Solo tú en la Familia" (o similar)
- [ ] El Miembro autenticado se identifica comparando con el `memberId` de Clerk
- [ ] `FamiliaTabPage.test.tsx` (renombrado de `HijosTabPage.test.tsx`) cubre: dos secciones, tarjetas de Miembro con "Tú", links a `/miembros/:memberId`, empty states. Prior art: `HijosTabPage.test.tsx`

## Blocked by

None - can start immediately
