# Visualización de datos de Miembro: pestaña Familia y MemberDetailPage

## Contexto

El ADR-0008 estableció el patrón `child_id OR member_id` para Pautas, Eventos y Visitas médicas. Las Pautas de Miembros ya funcionan en el backend, pero **no se ven en ningún sitio**: las Pautas finalizadas de Miembros no aparecen en `PautasPage` (solo activas) ni en `HijoDetailPage` (solo Hijos). Las Visitas médicas de Miembros tendrán el mismo problema cuando se implementen.

Los Miembros no son una entidad navegable hoy — solo aparecen como dato en formularios y en Ajustes. No hay ruta `/miembros/:id` ni pestaña en el Shell.

## Decisión

### 1. Pestaña "Hijos" → "Familia"

Renombrar la pestaña del Shell de "Hijos" a "Familia". La página lista Hijos y Miembros en **dos secciones separadas** con sus propios headers y empty states. Los Miembros dejan de ser solo dato y se convierten en entidad navegable.

### 2. `MemberDetailPage` con dos tabs

Nueva ruta `/miembros/:memberId` con un `MemberDetailPage` análogo a `HijoDetailPage` pero con solo dos tabs:

- **Pautas** — activas + finalizadas colapsables (componente `PautasSection` extraído y compartido).
- **Visitas** — placeholder con empty state hasta que `HealthVisit.member_id` se implemente (ADR-0008 pendiente).

### 3. Extracción de `PautasSection`

`PautasSection` (hoy embebida en `HijoDetailPage`) se extrae a `features/pautas/` como componente compartido, parametrizado por tipo de sujeto (`child` | `member`). Filtra por `child_id` o `member_id` según el tipo. `HijoDetailPage` y `MemberDetailPage` la consumen.

### 4. Rutas

- `/familia` — landing de la pestaña (lista Hijos + Miembros).
- `/hijos/:childId` — se mantiene sin cambios.
- `/miembros/:memberId` — nueva.

### 5. `PautasPage` se mantiene minimal

`/pautas` sigue mostrando solo Pautas activas de la Familia (vista global). Las finalizadas se consultan en el detalle de cada sujeto. No se reintroduce la sección "Finalizadas".

### 6. Filtro `member_id` en `GET /pautas`

Añadir `member_id` como filtro opcional en `list_pautas`, simétrico con `child_id`. `usePautas` acepta `member_id` en sus params.

### 7. Sin privacidad entre Miembros

Todo se comparte dentro de la Familia. No hay permisos por Miembro. El propósito de Tándem es compartir la carga mental.

### 8. Tarjeta de Miembro en la lista

Nombre + avatar (anagrama) + "Tú" si es el Miembro autenticado. Sin edad ni conteo de Pautas.

## Considered Options

- **`MemberDetailPage` sin pestaña "Familia" (descartado)**: los Miembros solo se accedían desde `PautaCard` o Ajustes. Pero un Miembro sin Pautas es innavegable, y sus Visitas quedarían huérfanas. Necesitan un índice navegable.

- **Pestaña "Miembros" separada en el Shell (descartado)**: satura la navegación (6 tabs) para una entidad con menos contenido que un Hijo. Renombrar "Hijos" a "Familia" es más económico y conceptualmente coherente.

- **Lista única mezclada de Hijos y Miembros (descartado)**: confunde dos roles distintos (actor vs sujeto pasivo). Dos secciones preservan la claridad del dominio.

- **`SubjectDetailPage` genérico (descartado)**: unificar `HijoDetailPage` y `MemberDetailPage` añadiría conditionales por tipo y perdería claridad. Mejor dos páginas paralelas que comparten componentes.

- **Reintroducir "Finalizadas" en `PautasPage` (descartado)**: revierte una decisión de diseño deliberada con tests que la respaldan. Las finalizadas pertenecen al contexto del sujeto.

- **Extraer `VisitasSection` ahora (descartado)**: speculative — `HealthVisit.member_id` no existe aún. Se extraerá cuando se implemente, con conocimiento real de los cambios necesarios.

## Consequences

- **Shell**: `TABS` cambia `label: 'Hijos'` → `label: 'Familia'`, `to: '/hijos'` → `to: '/familia'`.
- **`HijosTabPage`** → **`FamiliaTabPage`**: añade sección Miembros (lista + tarjetas). Mantiene la sección Hijos existente.
- **`App.tsx`**: nueva ruta `/familia` → `FamiliaTabPage`, `/miembros/:memberId` → `MemberDetailPage`. `/hijos/:childId` se mantiene.
- **`PautasSection`** extraída a `features/pautas/PautasSection.tsx`. `HijoDetailPage` la importa en vez de definirla inline.
- **`MemberDetailPage`**: nuevo componente en `features/members/MemberDetailPage.tsx` con tabs Pautas (usando `PautasSection`) y Visitas (placeholder).
- **Backend `GET /pautas`**: añade `member_id: uuid.UUID | None = Query(None)` y filtro `stmt.where(Pauta.member_id == member_id)`.
- **`usePautas`**: añade `member_id` a params y query string.
- **`Member` type**: puede necesitar exponer si es el Miembro autenticado (comparar con Clerk `memberId` en frontend).
- **Secuencia**: implementar después de `eventos-member-id` (PRD en `.scratch/eventos-member-id/`).
