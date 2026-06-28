# PRD: Eventos con sujeto Miembro (`member_id`)

Status: ready-for-agent

## Problem Statement

Los Eventos de Miembros no se pueden atribuir correctamente. En producción se workaround-ea creando Eventos con `child_id = null`, perdiendo la atribución — "cita médica de Ana" y "pagar el colegio" son indistinguibles. El modelo de Evento solo tiene `child_id` (FK a Hijos), pero un Miembro también puede ser sujeto de un Evento (cita médica, trámite, etc.). Adicionalmente, un Evento puede involucrar a ambos ("Ana lleva a Mateo al pediatra").

## Solution

Añadir `member_id` (FK a `members.id`, nullable) al modelo de Evento, siguiendo el patrón polimórfico documentado en ADR-0008. Ambos sujetos (`child_id` y `member_id`) son independientes y opcionales — un Evento puede ser de la Familia (ambos null), de un Hijo, de un Miembro, o de ambos. El cambio abarca backend (modelo, migración, API, MCP) y frontend (tipos, formulario, visualización).

## User Stories

1. Como Miembro, quiero crear un Evento atribuido a un Miembro (p. ej. "Cita médica de Ana"), para que se distinga de los Eventos de la Familia y de los Hijos.
2. Como Miembro, quiero crear un Evento atribuido a un Hijo, para que se vea asociado a ese Hijo en la agenda.
3. Como Miembro, quiero crear un Evento sin sujeto (de la Familia), para que represente algo global del hogar.
4. Como Miembro, quiero crear un Evento atribuido a un Hijo y a un Miembro simultáneamente (p. ej. "Ana lleva a Mateo al pediatra"), para que el Evento sea relevante para ambos.
5. Como Miembro, quiero ver el nombre del Miembro como chip en la lista de Eventos, para saber de quién es cada Evento.
6. Como Miembro, quiero ver ambos chips (Hijo + Miembro) cuando un Evento tiene ambos sujetos, para entender de quién es.
7. Como Miembro, quiero filtrar Eventos por Miembro, para ver los Eventos de una persona concreta.
8. Como Miembro, quiero editar el sujeto de un Evento existente (cambiar de Familia a Miembro, o de Hijo a Miembro), para corregir errores de atribución.
9. Como Miembro, quiero usar el selector de sujeto con optgroups Hijos/Miembros y opción "Familia" en el formulario de Evento, para elegir el sujeto fácilmente.
10. Como Miembro, quiero usar el mismo selector en el formulario de Serie recurrente, para crear Eventos recurrentes atribuidos a un Miembro.
11. Como usuario de voz (MCP), quiero decir "crea un evento: cita de Ana el viernes" y que el sistema resuelva Ana automáticamente (sea Hija o Miembro), para no tener que especificar el tipo.
12. Como usuario de voz (MCP), quiero que la respuesta confirme el sujeto del Evento creado, para verificar que se atribuyó correctamente.
13. Como usuario de voz (MCP), quiero recibir un error con los nombres válidos si el nombre no coincide con ningún Hijo ni Miembro, para corregirlo.
14. Como usuario de voz (MCP), quiero recibir un error de ambigüedad si el nombre coincide con varios sujetos, para desambiguar.
15. Como Miembro, quiero ver el nombre del Miembro en el héroe "Hoy" cuando el Evento más inminente es de un Miembro, para saber de quién es.
16. Como Miembro, quiero ver ambos nombres concatenados en el héroe "Hoy" cuando el Evento tiene ambos sujetos, para saber de quién es.

## Implementation Decisions

### Modelo de datos

- `Event` añade `member_id: str | None` (FK a `members.id`, nullable, indexado). Sin CHECK constraint con `child_id` — ambos pueden ser non-null simultáneamente. Cardinalidad de Evento: cero, uno o dos sujetos.
- `EventCreate` añade `member_id: str | None = None`.
- `EventUpdate` añade `member_id: str | None = None`.
- `EventOut` añade `member_id: str | None` + `member: MemberOut | None` donde `MemberOut` es un nuevo DTO con `{ id: str, display_name: str | None }`. Objetos expandidos, no flat `subject_name`. Sin campo `subject_name` — la UI lo deriva.
- `SeriesCreate` añade `member_id: str | None = None`. Se propaga a cada Evento materializado en `create_series`.

### Migración de DB

- Nueva migración Alembic: añade columna `member_id` (VARCHAR, FK a `members.id`, nullable) a la tabla `events`. Sin CHECK constraint. Sin migración de datos — los Eventos existentes con `child_id = null` siguen siendo "de la Familia".

### Backend API (`/events`)

- `GET /events` acepta `?member_id=` como query param adicional (simétrico con `?type_id=` y `?child_id=`).
- `POST /events` valida que `member_id` pertenezca a la Familia autenticada (`session.get(Member, data.member_id)` + check `family_id`). Devuelve 403 si no pertenece. Misma validación que Pauta.
- `PATCH /events/{id}` valida `member_id` si está presente en el patch.
- `_enrich` se refactoriza a `load_event_views(session, events) -> list[EventOut]` con batch-loading: recolecta todos los `child_ids`, `member_ids` y `event_type_ids`, hace un `SELECT ... WHERE id IN (...)` por cada conjunto, y construye los `EventOut` desde los dicts. Patrón de `pautas_service.load_pauta_views`.

### Backend — vista Hoy (`today.py`)

- `_event_context` actualizado: si `ev.child` y `ev.member` ambos presentes, concatena: `"Mateo · Ana"`. Si solo `child`, devuelve `child.name`. Si solo `member`, devuelve `member.display_name`. Si ninguno, devuelve `event_type.name`.

### MCP

- Esquema de `create_event`: `child_name` se reemplaza por `subject_name` (string opcional). Sin alias.
- Nuevo resolver `resolve_subject_by_name(session, name) -> Child | Member | SubjectMatchError`:
  - Busca en `Child.name` y `Member.display_name` simultáneamente (matching exacto case-insensitive).
  - Excluye Miembros con `display_name = null`.
  - 0 coincidencias → `SubjectMatchError(reason="not_found")` con lista de nombres válidos (Hijos + Miembros con display_name).
  - 1 coincidencia → devuelve el `Child` o `Member`.
  - 2+ coincidencias → `SubjectMatchError(reason="ambiguous")`.
  - Vive en `backend/app/mcp/subject_matching.py` (nuevo módulo, paralelo a `child_matching.py`).
- `do_create_event` actualizado: usa `subject_name` en lugar de `child_name`. Si resuelve a `Child`, asigna `child_id`. Si resuelve a `Member`, asigna `member_id`. Si no se proporciona `subject_name`, ambos son null (Familia).
- Respuesta MCP unificada: `subject_name: str | None` + `subject_type: "child" | "member" | None` en lugar de `child_id`.
- `resolve_subject_by_name` convive con `resolve_child_by_name`. Las herramientas de Hijos (Medidas, Tallas) siguen usando esta última. La migración de `record_health_visit`, `start_pauta` y `list_active_pautas` a `resolve_subject_by_name` se hará en otra sesión.

### Frontend

- `EventOut` (types.ts): añade `member_id: string | null` + `member: MemberSummary | null` donde `MemberSummary = { id: string; display_name: string | null }`.
- `EventCreate` / `EventUpdate` / `SeriesCreate` (types.ts): añaden `member_id?: string | null`.
- `EventForm` (en `EventosPage.tsx`): reemplaza el `<select>` de Hijos por un selector con optgroups "Hijos" / "Miembros" + opción "Familia" (value vacío). Recibe `members` como prop nueva. Patrón de `PautaForm.tsx` con valor compuesto `child:${id}` / `member:${id}`.
- `SeriesForm`: mismo cambio de selector. Recibe `members` como prop nueva.
- Lista de Eventos: añade `{ev.member && <span className="evento-chip">{ev.member.display_name}</span>}` junto al chip de Hijo existente.
- `events-api.ts`: `useEvents` acepta `member_id` en filters. `createEvent` y `updateEvent` envían `member_id` en el body.
- Helper `eventSubjectName(ev)` en el frontend para derivar el nombre del sujeto (Hijo, Miembro, o "Familia").

### ADR-0008

- Cardinalidad de Evento actualizada: "cero o uno" → "cero, uno o dos" (sin CHECK constraint).
- Consequences ampliadas con todas las decisiones de implementación de esta fase.

## Testing Decisions

### Principios

- Testear comportamiento externo, no detalles de implementación.
- TDD no negociable: escribir el test que falla primero, luego implementar.
- No mockear la base de datos — los tests de backend usan Postgres real via testcontainers (patrón existente en `conftest.py`).
- Los tests de frontend usan MSW para mockear HTTP (patrón existente).

### Seams (todos existentes — no se crean nuevos)

1. **`backend/tests/test_events.py`** (REST API) — Tests HTTP via `auth_client`. Crear Evento con `member_id`, listar con filtro `?member_id=`, actualizar `member_id`, validación de pertenencia (403), `EventOut.member` expandido, Evento con ambos sujetos. Prior art: `test_create_event_with_time_and_child`, `test_list_events_with_filters`.

2. **`backend/tests/test_mcp_server.py`** (MCP) — Tests via `mcp_client_factory`. `create_event` con `subject_name` resolviendo a Hijo, a Miembro, a ninguno (Familia). Error not_found con nombres válidos. Error ambiguous. Respuesta con `subject_name` + `subject_type`. Prior art: `test_create_event_with_child`, `test_create_event_child_not_found`.

3. **`backend/tests/test_today.py`** (Hoy) — Verificar `_event_context` muestra `member.display_name` cuando el Evento es de Miembro, y concatenación cuando ambos sujetos. Prior art: tests existentes de `_event_hero`.

4. **`backend/tests/test_series.py`** (Series) — Crear Serie con `member_id`, verificar que los Eventos materializados tienen `member_id`. Prior art: tests existentes de `create_series`.

5. **`frontend/src/features/eventos/EventosPage.test.tsx`** (UI) — MSW mocks con `member_id` y `member` en `EventOut`. Verificar selector con optgroups, chips de Miembro, formulario envía `member_id`. Prior art: tests existentes de creación/edición de Eventos.

6. **`frontend/src/features/eventos/events-api.test.tsx`** (API hooks) — Verificar `useEvents` pasa `member_id` como query param. Prior art: tests existentes de `useEvents`.

## Out of Scope

- **Visitas médicas con `member_id`** — mayor scope, requiere migración de `HealthVisit` y cambios en `PautaCreate`. Se abordará en otra fase.
- **Migración de `record_health_visit`, `start_pauta`, `list_active_pautas` a `resolve_subject_by_name`** — se hará en otra sesión de grilling + implementación.
- **`MemberDetailPage`** — la decisión sobre dónde ver Pautas/Eventos/Visitas finalizadas de Miembros se pospone hasta tener Eventos de Miembros funcionando.
- **Filtro o agrupación por sujeto en la UI de la agenda** — se mantiene lista plana. El filtro `?member_id=` existe en la API pero no se añade UI de filtro ahora.
- **Medidas y Tallas** — siguen siendo exclusivas de Hijos. No se ven afectadas.
- **Campo "acompañante"** — si en el futuro se necesita distinguir "quién lleva a quién" más allá de la atribución de sujetos, se añadirá un campo separado. Hoy ambos sujetos son tratados simétricamente.

## Further Notes

- ADR-0008 ya está actualizado con todas las decisiones de esta fase.
- Handoff actualizado en `docs/handoff/handoff-grilling-sujeto-polimorfico.md`.
- El patrón de selector con optgroups y valor compuesto (`child:${id}` / `member:${id}`) ya está implementado en `PautaForm.tsx` — usar como referencia.
- El patrón de batch-loading ya está implementado en `pautas_service.load_pauta_views` — usar como referencia para `load_event_views`.
- El patrón de validación de pertenencia de `member_id` ya está implementado en `pautas.py` — usar como referencia.
- El resolver `resolve_child_by_name` en `child_matching.py` es la referencia para `resolve_subject_by_name`.
