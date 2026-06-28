## Parent

`.scratch/visualizacion-miembro/PRD.md`

## What to build

Crear `MemberDetailPage` en `features/members/MemberDetailPage.tsx` con estructura paralela a `HijoDetailPage`: header con avatar + nombre, botón back a `/familia`, y dos tabs. Tab "Pautas": usa `PautasSection` (extraída en issue 01) con `subjectType: 'member'`, mostrando activas + finalizadas colapsables + formulario de creación. Tab "Visitas": placeholder con empty state ("Sin visitas médicas") — sin lógica de creación hasta que `HealthVisit.member_id` exista. Nueva ruta `/miembros/:memberId` en `App.tsx`. Tab por defecto: "Pautas".

## Acceptance criteria

- [ ] Ruta `/miembros/:memberId` en `App.tsx` renderiza `MemberDetailPage`
- [ ] Header con avatar (anagrama) + nombre del Miembro
- [ ] Botón back a `/familia`
- [ ] Tab "Pautas" usa `PautasSection` con `subjectType: 'member'` — muestra activas + finalizadas colapsables
- [ ] Tab "Pautas": formulario de creación con sujeto preseleccionado al Miembro
- [ ] Tab "Visitas": placeholder con empty state "Sin visitas médicas"
- [ ] Tab por defecto: "Pautas"
- [ ] `MemberDetailPage.test.tsx` cubre: tabs, Pautas activas/finalizadas, Visitas placeholder, back a `/familia`. Prior art: `HijoDetailPage.test.tsx`

## Blocked by

- `.scratch/visualizacion-miembro/issues/01-extraer-pautas-section.md` (necesita `PautasSection` extraída)
- `.scratch/visualizacion-miembro/issues/03-pestana-familia-lista-miembros.md` (necesita ruta `/familia` para back nav)
