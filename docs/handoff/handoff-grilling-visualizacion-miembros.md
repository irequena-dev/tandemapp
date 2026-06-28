# Handoff: Grilling — visualización de datos de Miembros

## Contexto

Sesión de `/grill-with-docs` derivada del problema original: las Pautas finalizadas de Miembros no se ven en ningún sitio. El ADR-0008 ya decidió el patrón `child_id OR member_id` (ver handoff hermano `handoff-grilling-sujeto-polimorfico.md`). Este handoff se centra en el problema de **visualización**: dónde y cómo se ven los datos scoped a un Miembro.

## Estado actual

- **PautasPage** (`/pautas`): muestra **solo activas**, sin sección "Finalizadas" (eliminada deliberadamente, tests lo verifican en `PautasPage.test.tsx`).
- **HijoDetailPage** (`/hijos/:childId`): tiene `PautasSection` que filtra por `child_id` y muestra activas + finalizadas colapsables. Es el modelo a imitar/extraer.
- **No existe `MemberDetailPage`** ni ruta `/miembros/:id`. Los Miembros solo aparecen como dato en formularios.
- **No hay pestaña "Miembros"** en el Shell — los Miembros no son una entidad navegable.

## Opciones identificadas

### Opción A: `MemberDetailPage` análogo a `HijoDetailPage`

- Nueva ruta `/miembros/:memberId` con tabs (Pautas, Visitas médicas cuando se implementen).
- Requiere añadir Miembros como entidad navegable (¿pestaña? ¿lista en algún sitio?).
- Un Miembro no tiene Medidas, Tallas ni edad — el detalle sería más simple que el de un Hijo.
- **Tensión**: un Miembro viendo su propio detalle vs viendo el de otro Miembro. ¿Tiene sentido que Ana vea las Pautas de Beto? Sí — comparten carga mental. Pero ¿quiere Beto que Ana vea sus Pautas? Probablemente sí, es el propósito de Tándem.

### Opción B: Sección "Finalizadas" en `PautasPage` con filtro por sujeto

- Añadir una sección colapsable "Finalizadas" a `PautasPage` (hoy eliminada).
- Las Pautas ya tienen `subject_name` — se podrían agrupar o filtrar por sujeto.
- No requiere nueva ruta ni nueva entidad navegable.
- **Tensión**: la PautasPage fue diseñada para ser minimal (solo activas). Reintroducir finalizadas revierte una decisión de diseño deliberada.

### Opción C (no discutida aún): Extraer la `PautasSection` de `HijoDetailPage` y reutilizarla

- `PautasSection` ya filtra por `child_id` y muestra activas/finalizadas. Generalizarla a "filtrar por sujeto (child_id o member_id)".
- Podría vivir en un `MemberDetailPage` o en una vista de "Pautas por sujeto".
- Es un refactor del componente existente, no un diseño desde cero.

## Decisiones del grilling (ADR-0009)

1. **Miembros sí tienen página de detalle** — necesaria para Visitas + Pautas finalizadas. Sin ella, las Visitas de Miembros no tienen hogar.
2. **Pestaña "Hijos" → "Familia"** — dos secciones (Hijos, Miembros) con sus propios headers y empty states. Los Miembros dejan de ser solo dato y se convierten en entidad navegable.
3. **`MemberDetailPage` con dos tabs**: Pautas (activas + finalizadas) y Visitas (placeholder hasta que `HealthVisit.member_id` exista).
4. **Extraer `PautasSection`** a `features/pautas/` como componente compartido, parametrizado por tipo de sujeto (`child` | `member`).
5. **Filtro `member_id` en `GET /pautas`** — simétrico con `child_id`. `usePautas` acepta `member_id`.
6. **Sin privacidad** entre Miembros — todo se comparte dentro de la Familia.
7. **`PautasPage` se mantiene minimal** (solo activas). Las finalizadas viven en el detalle del sujeto.
8. **No renombrar `HijoDetailPage`** — `MemberDetailPage` es su paralelo, no una generalización.
9. **Rutas**: `/familia` (landing), `/hijos/:childId` (mantener), `/miembros/:memberId` (nueva).
10. **Tab "Visitas" placeholder** en `MemberDetailPage` — extracción de `VisitasSection` se pospone hasta que `HealthVisit.member_id` exista.
11. **`HijoDetailPage` mantiene su tab "Pautas"** con el componente extraído.
12. **Tarjeta de Miembro**: nombre + avatar + "Tú" si es el autenticado.
13. **Secuencia**: implementar después de `eventos-member-id`.

## Artefactos creados

- `docs/adr/0009-visualizacion-datos-miembro.md` — ADR con todas las decisiones

## Artefactos de referencia

- `docs/adr/0008-sujeto-polimorfico-hijo-o-miembro.md` — la decisión de dominio
- `docs/handoff/handoff-grilling-sujeto-polimorfico.md` — handoff hermano (Eventos + Visitas)
- `CONTEXT.md` — lenguaje ubicuo

## Archivos clave a leer

- `frontend/src/features/pautas/PautasPage.tsx` — página actual (solo activas)
- `frontend/src/features/pautas/PautasPage.test.tsx` — tests que verifican que NO hay sección "Finalizadas"
- `frontend/src/features/hijos-tab/HijoDetailPage.tsx:950-1063` — `PautasSection` (modelo a extraer/generalizar)
- `frontend/src/features/pautas/PautaCard.tsx` — tarjeta de Pauta (acepta `showSubject` prop)
- `frontend/src/features/pautas/api.ts:36-48` — `usePautas` (filtro por `child_id`, no `member_id`)
- `frontend/src/App.tsx` — rutas (no hay ruta de Miembros)
- `frontend/src/features/shell/Shell.tsx:61-67` — tabs de navegación (no hay tab de Miembros)
- `backend/app/api/pautas.py:134-160` — `list_pautas` (filtra por `child_id`, no `member_id`)

## Skills sugeridos

- `/grill-with-docs` — continuar el grilling sobre la solución de visualización
- `/domain-modeling` — mantener el lenguaje ubicuo
- `/codebase-design` — evaluar la extracción de `PautasSection` como módulo reutilizable
- `/design-taste-frontend` — si se diseña un `MemberDetailPage`, asegurar que no sea un `HijoDetailPage` degradado
