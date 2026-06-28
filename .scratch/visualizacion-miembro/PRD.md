# PRD: Visualización de datos de Miembro (pestaña Familia y MemberDetailPage)

Status: ready-for-agent

## Problem Statement

Las Pautas y Visitas médicas de Miembros no se ven en ningún sitio. Las Pautas finalizadas de Miembros no aparecen en `PautasPage` (solo activas) ni en `HijoDetailPage` (solo Hijos). Las Visitas médicas de Miembros tendrán el mismo problema cuando se implementen. Los Miembros no son una entidad navegable — solo aparecen como dato en formularios y en Ajustes. Sin un detalle de Miembro, las Visitas de Miembros quedan huérfanas.

## Solution

Renombrar la pestaña "Hijos" a "Familia" y listar Hijos y Miembros en dos secciones. Crear un `MemberDetailPage` con tabs Pautas y Visitas (placeholder). Extraer `PautasSection` de `HijoDetailPage` a un componente compartido parametrizado por tipo de sujeto. Añadir filtro `member_id` a `GET /pautas`. La `PautasPage` se mantiene minimal (solo activas). Sin privacidad entre Miembros — todo se comparte dentro de la Familia.

## User Stories

1. Como Miembro, quiero ver una pestaña "Familia" en el Shell, para encontrar a todas las personas de mi Familia en un solo sitio.
2. Como Miembro, quiero ver a los Hijos y Miembros en secciones separadas dentro de "Familia", para distinguir los sujetos pasivos (Hijos) de los actores (Miembros).
3. Como Miembro, quiero ver mi nombre marcado como "Tú" en la lista de Miembros, para saber cuál soy yo.
4. Como Miembro, quiero tocar la tarjeta de un Miembro para ir a su página de detalle, para ver sus Pautas y Visitas.
5. Como Miembro, quiero ver las Pautas activas de un Miembro en su detalle, para saber qué tratamientos tiene en curso.
6. Como Miembro, quiero ver las Pautas finalizadas de un Miembro en una sección colapsable, para consultar el historial sin que ocupe espacio.
7. Como Miembro, quiero crear una Pauta desde el detalle de un Miembro, para registrar un tratamiento sin salir de la página.
8. Como Miembro, quiero ver un tab "Visitas" en el detalle de un Miembro, para saber dónde irán sus visitas médicas cuando se implementen.
9. Como Miembro, quiero ver un empty state en el tab "Visitas" de un Miembro sin visitas, para entender que aún no hay visitas registradas.
10. Como Miembro, quiero volver a "Familia" desde el detalle de un Miembro con un botón back, para navegar de vuelta fácilmente.
11. Como Miembro, quiero que el detalle de un Hijo siga funcionando igual tras la extracción de `PautasSection`, para que no haya regresiones.
12. Como Miembro, quiero que la `PautasPage` siga mostrando solo Pautas activas, para que la vista global no se sature con historial.
13. Como Miembro, quiero que el backend filtre Pautas por `member_id`, para que la query del detalle de un Miembro sea eficiente.
14. Como Miembro, quiero ver el avatar (anagrama) de un Miembro en su tarjeta, para identificarlo visualmente igual que a los Hijos.
15. Como Miembro, quiero ver un empty state cuando la Familia no tiene Hijos, para saber que puedo añadirlos desde Ajustes.
16. Como Miembro, quiero ver un empty state cuando la Familia no tiene otros Miembros, para entender que puedo invitarlos desde Ajustes.

## Implementation Decisions

### ADR

- **ADR-0009** (`docs/adr/0009-visualizacion-datos-miembro.md`) documenta todas las decisiones de este PRD.

### Shell — renombrar pestaña

- El array `TABS` en `Shell.tsx` cambia el entry de Hijos: `label: 'Hijos'` → `label: 'Familia'`, `to: '/hijos'` → `to: '/familia'`.
- El icono se mantiene (es un icono de personas, ya encaja con "Familia").

### Rutas

- `/familia` → `FamiliaTabPage` (nueva landing de la pestaña).
- `/hijos/:childId` → `HijoDetailPage` (se mantiene sin cambios de ruta).
- `/miembros/:memberId` → `MemberDetailPage` (nueva).
- `/hijos` deja de ser una ruta de pestaña — redirección a `/familia` opcional (para bookmarks antiguos).

### `FamiliaTabPage` (renombre + extensión de `HijosTabPage`)

- `HijosTabPage` se renombra a `FamiliaTabPage` y pasa a `features/familia/` (o se mantiene en `hijos-tab/` renombrado — decisión de organización de ficheros).
- Dos secciones con headers propios: "Hijos" y "Miembros".
- Sección Hijos: igual que hoy — tarjetas con nombre, edad, métricas, link a `/hijos/:childId`.
- Sección Miembros: tarjetas con nombre, avatar (anagrama), "Tú" si es el Miembro autenticado, link a `/miembros/:memberId`.
- Cada sección tiene su propio empty state ("Aún no hay Hijos en la Familia", "Solo tú en la Familia").
- Usa `useChildrenWithMetrics()` (existente) + `useMembers()` (existente).
- El Miembro autenticado se identifica comparando con el `memberId` de Clerk (`useAuth` / `useOrganization`).

### `MemberDetailPage` (nueva)

- Vive en `features/members/MemberDetailPage.tsx`.
- Estructura paralela a `HijoDetailPage`: header con avatar + nombre, tabs debajo, botón back a `/familia`.
- **Tab "Pautas"**: usa `PautasSection` extraída con `subjectType: 'member'` y `subjectId: memberId`.
- **Tab "Visitas"**: placeholder con empty state ("Sin visitas médicas"). Sin lógica de creación/edición hasta que `HealthVisit.member_id` exista.
- Tab por defecto: "Pautas" (es lo único con contenido real hoy).

### Extracción de `PautasSection`

- `PautasSection` (hoy en `HijoDetailPage.tsx:950-1063`) se extrae a `features/pautas/PautasSection.tsx`.
- Props: `subjectId: string`, `subjectType: 'child' | 'member'`, `subjectName: string`, `pautas: Pauta[]`, `visits: HealthVisit[]`, `children: Child[]`, `members: Member[]`.
- Filtra `p.child_id === subjectId` cuando `subjectType === 'child'`, `p.member_id === subjectId` cuando `subjectType === 'member'`.
- Muestra activas (ordenadas por `next_dose_at`) + finalizadas colapsables (ordenadas por `created_at` desc).
- Incluye formulario de creación (`PautaForm`) con el sujeto preseleccionado.
- `HijoDetailPage` la importa en su tab "Pautas" pasando `subjectType: 'child'`.
- `MemberDetailPage` la importa pasando `subjectType: 'member'`.

### Backend — filtro `member_id` en `GET /pautas`

- `list_pautas` en `backend/app/api/pautas.py` añade `member_id: uuid.UUID | None = Query(None)`.
- Filtro: `if member_id: stmt = stmt.where(Pauta.member_id == member_id)`.
- Simétrico con el filtro `child_id` existente.

### Frontend — `usePautas` acepta `member_id`

- `usePautas` en `frontend/src/features/pautas/api.ts` añade `member_id?: string` a sus params.
- Lo añade al `URLSearchParams` y a la query key.

### `PautasPage` — sin cambios

- Sigue mostrando solo Pautas activas. Los tests existentes lo verifican y no se modifican.

### Sin privacidad

- No se añade ningún mecanismo de privacidad o permisos por Miembro. Todo se comparte dentro de la Familia.

## Testing Decisions

### Principios

- Testear comportamiento externo, no detalles de implementación.
- TDD no negociable: escribir el test que falla primero, luego implementar.
- Los tests de frontend usan MSW para mockear HTTP (patrón existente).
- Los tests de backend usan Postgres real via testcontainers (patrón existente en `conftest.py`).

### Seams

1. **`backend/tests/test_pautas.py`** (REST API) — Test del filtro `?member_id=` en `GET /pautas`. Crear Pautas con `member_id` y `child_id`, verificar que el filtro devuelve solo las del Miembro. Prior art: `test_pauta_list_filters` (que testa `?child_id=` y `?status=`).

2. **`frontend/src/features/hijos-tab/HijosTabPage.test.tsx`** → renombrado a **`FamiliaTabPage.test.tsx`** — Verifica dos secciones (Hijos, Miembros), tarjetas de Miembro con nombre + "Tú", links a `/miembros/:memberId`, empty states de cada sección. Prior art: tests existentes de `HijosTabPage`.

3. **`frontend/src/features/hijos-tab/HijoDetailPage.test.tsx`** — Verifica que el tab "Pautas" sigue funcionando tras la extracción de `PautasSection` (activas, finalizadas colapsables, formulario). Prior art: tests existentes del tab Pautas en `HijoDetailPage`.

4. **`frontend/src/features/pautas/PautasPage.test.tsx`** — Verifica que `PautasPage` sigue mostrando solo activas, sin sección "Finalizadas". No se añaden tests nuevos — los existentes son la regresión guard.

5. **Nuevo: `frontend/src/features/members/MemberDetailPage.test.tsx`** — Verifica tabs (Pautas con activas/finalizadas, Visitas placeholder con empty state), navegación back a `/familia`, `PautasSection` filtra por `member_id`. Prior art: `HijoDetailPage.test.tsx`.

6. **Nuevo: `frontend/src/features/pautas/PautasSection.test.tsx`** — Test unitario del componente extraído con `subjectType: 'child'` y `subjectType: 'member'`. Verifica filtrado correcto, activas/finalizadas, formulario con sujeto preseleccionado. Prior art: `PautasPage.test.tsx` (patrones de MSW + render).

## Out of Scope

- **Visitas médicas con `member_id`** — mayor scope, requiere migración de `HealthVisit` y cambios en `PautaCreate`. Se abordará en otra fase. El tab "Visitas" de `MemberDetailPage` es placeholder.
- **Extracción de `VisitasSection`** — se pospone hasta que `HealthVisit.member_id` exista, para extraer con conocimiento real de los cambios necesarios.
- **`SubjectDetailPage` genérico** — no se unifica `HijoDetailPage` y `MemberDetailPage`. Son páginas paralelas que comparten componentes.
- **Privacidad entre Miembros** — no se implementa. Todo se comparte dentro de la Familia.
- **Reintroducir "Finalizadas" en `PautasPage`** — se mantiene minimal (solo activas).
- **Pestaña "Miembros" separada en el Shell** — se renombra "Hijos" a "Familia" en su lugar.
- **Medidas y Tallas** — siguen siendo exclusivas de Hijos. No se ven afectadas.
- **Eventos de Miembros** — abordado en PRD separada (`eventos-member-id`). Esta PRD asume que `eventos-member-id` ya está implementado.

## Further Notes

- ADR-0009 documentado en `docs/adr/0009-visualizacion-datos-miembro.md`.
- Handoff actualizado en `docs/handoff/handoff-grilling-visualizacion-miembros.md`.
- El patrón de selector con optgroups y valor compuesto (`child:${id}` / `member:${id}`) ya está implementado en `PautaForm.tsx` — `PautasSection` lo reutiliza pasando el sujeto preseleccionado.
- `PautaCard` ya acepta `showSubject` prop — en el detalle de Miembro se usa `showSubject={false}` igual que en el detalle de Hijo.
- `useMembers()` ya existe y devuelve `Member[]` con `id`, `family_id`, `display_name`.
- El Miembro autenticado se identifica via Clerk — revisar cómo se obtiene el `memberId` actual (posiblemente via `useOrganization` o el token JWT).
- Secuencia: implementar después de `eventos-member-id` (PRD en `.scratch/eventos-member-id/`).
