# Handoff: Grilling — sujeto polimórfico Hijo/Miembro

## Contexto

Sesión de `/grill-with-docs` sobre la implicación de haber añadido Pautas para Miembros (no solo Hijos). El problema original: las Pautas finalizadas de Miembros no se ven en ningún sitio (las de Hijos se ven en `HijoDetailPage`, pero no hay `MemberDetailPage`).

## Lo que se decidió (sesión 1)

1. **No unificar Hijo y Miembro** — son roles distintos (actor vs sujeto) con campos diferentes. El solapamiento (Pautas, Eventos, Visitas) no justifica unificar.

2. **ADR-0008 escrito**: `docs/adr/0008-sujeto-polimorfico-hijo-o-miembro.md`. Documenta el patrón `child_id OR member_id` como decisión de dominio.

3. **CONTEXT.md actualizado**: definiciones de Evento y Visita médica ahora reflejan que el sujeto puede ser Hijo o Miembro.

## Lo que se decidió (sesión 2 — grilling de Eventos)

### Modelo de datos

- **`Event.member_id`**: FK a `members.id`, nullable. Sin CHECK constraint con `child_id` — ambos pueden ser non-null simultáneamente (caso "Ana lleva a Mateo al pediatra"). Cardinalidad de Evento: cero, uno o dos sujetos.
- **`EventOut`**: añade `member_id: str | None` + `member: MemberOut | None` donde `MemberOut = { id, display_name }`. Objetos expandidos (no flat `subject_name`). Sin `subject_name` — la UI lo deriva con un helper.
- **`EventCreate` / `EventUpdate`**: añaden `member_id: str | None` con validación explícita de pertenencia a la Familia (igual que Pauta).
- **`GET /events`**: acepta `?member_id=` como filtro adicional (simétrico con `?child_id=`).
- **`SeriesCreate`**: añade `member_id: str | None` y se propaga a cada Evento materializado.

### Backend — refactor

- **`_enrich` → `load_event_views`**: refactorizar a batch-loading. Batch-loadea `Child`, `Member` y `EventType` con `SELECT ... WHERE id IN (...)`. Patrón de `pautas_service.load_pauta_views`.
- **`_event_context` en today.py**: actualizado para considerar `member.display_name` además de `child.name`. Si ambos sujetos presentes, concatena: "Mateo · Ana".

### MCP

- **`child_name` → `subject_name`** en el esquema de `create_event`. Sin alias.
- **`resolve_subject_by_name`**: nuevo resolver polimórfico. Busca en `Child.name` y `Member.display_name` simultáneamente (matching exacto case-insensitive). Excluye Miembros con `display_name = null`. Devuelve `Child | Member | SubjectMatchError`.
- **Respuesta MCP unificada**: `subject_name` + `subject_type` ("child" | "member" | null) en lugar de `child_id`.
- **`resolve_subject_by_name` convive con `resolve_child_by_name`**. Las herramientas de Hijos (Medidas, Tallas) siguen usando esta última. `record_health_visit`, `start_pauta` y `list_active_pautas` migrarán a `resolve_subject_by_name` en otra sesión.

### Frontend

- **`EventOut` (types.ts)**: añade `member_id: string | null` + `member: MemberSummary | null` donde `MemberSummary = { id: string; display_name: string | null }`.
- **`EventCreate` / `EventUpdate` / `SeriesCreate` (types.ts)**: añaden `member_id?: string | null`.
- **Selector de sujeto**: `EventForm` y `SeriesForm` reemplazan el `<select>` de Hijos por un selector con optgroups "Hijos" / "Miembros" + opción "Familia" (vacío). Ambos reciben `members` como prop. Patrón de `PautaForm.tsx`.
- **Lista plana**: sin agrupación ni filtro nuevo. Ambos chips (`child.name` + `member.display_name`) cuando ambos sujetos están presentes.
- **`events-api.ts`**: `useEvents` acepta `member_id` en filters.

### ADR-0008 actualizado

- Cardinalidad de Evento: "cero o uno" → "cero, uno o dos" (sin CHECK constraint).
- Consequences ampliadas con todas las decisiones de implementación.

## Lo que falta por hacer

### Eventos con `member_id` (prioridad inmediata — implementar)

Implementación TDD siguiendo las decisiones de arriba. Orden sugerido:

1. **Migración DB**: añadir `events.member_id` (FK a `members.id`, nullable). Sin CHECK constraint.
2. **Modelos**: `Event.member_id`, `EventCreate.member_id`, `EventUpdate.member_id`, `EventOut.member_id` + `member: MemberOut`, `SeriesCreate.member_id`.
3. **Backend API**: `load_event_views` (batch-loading), validación de pertenencia, filtro `?member_id=`, `_event_context` actualizado.
4. **MCP**: `resolve_subject_by_name`, `subject_name` en `create_event`, respuesta unificada.
5. **Frontend**: types, selector con optgroups, chips, `useEvents` con `member_id`.

### Pautas (problema de visualización — decisión pospuesta)

- Backend: ✅ ya hecho (`child_id OR member_id`).
- **Problema abierto**: ¿dónde se ven las Pautas finalizadas de Miembros?
  - Opción A: `MemberDetailPage` análogo a `HijoDetailPage`.
  - Opción B: sección "Finalizadas" en `PautasPage` con filtro por sujeto.
  - Decisión pospuesta hasta tener Eventos de Miembros funcionando para informar la decisión.

### Visitas médicas (mayor scope)

- Backend: `HealthVisit.child_id` → nullable + añadir `member_id`. Migración de DB.
- `PautaCreate` deja de prohibir `health_visit_id` cuando el sujeto es Miembro (hoy lanza 400 en `backend/app/api/pautas.py:98-102`).
- Frontend: dónde se ven las Visitas de Miembros (mismo problema de visualización que Pautas).

### Migración MCP de herramientas existentes a `resolve_subject_by_name`

- `record_health_visit`, `start_pauta`, `list_active_pautas` migrarán de `resolve_child_by_name` a `resolve_subject_by_name` en otra sesión de grilling.

## Artefactos creados/actualizados

- `docs/adr/0008-sujeto-polimorfico-hijo-o-miembro.md` — ADR actualizado con decisiones de Eventos
- `CONTEXT.md` — definiciones de Evento y Visita médica actualizadas

## Archivos clave a leer en la próxima sesión

- `docs/adr/0008-sujeto-polimorfico-hijo-o-miembro.md` — la decisión (actualizada)
- `CONTEXT.md` — lenguaje ubicuo
- `backend/app/models.py:168-244` — modelo de Event, EventCreate, EventUpdate, EventOut
- `backend/app/models.py:251-305` — modelo de Series, SeriesCreate
- `backend/app/models.py:601-670` — modelo de Pauta (referencia del patrón ya implementado)
- `backend/app/api/events.py` — router de Eventos (`_enrich` a refactorizar)
- `backend/app/api/today.py:214-220` — `_event_context` (a actualizar)
- `backend/app/api/series.py:80-120` — `create_series` (materialización)
- `backend/app/mcp/server.py:450-530` — `do_create_event` (a refactorizar con `subject_name`)
- `backend/app/mcp/child_matching.py` — `resolve_child_by_name` (referencia para `resolve_subject_by_name`)
- `backend/app/pautas_service.py:80-159` — `load_pauta_views` (referencia de batch-loading)
- `frontend/src/features/pautas/PautaForm.tsx` — referencia del selector de sujeto (optgroups Hijos/Miembros)
- `frontend/src/features/eventos/types.ts` — tipos de Evento (a actualizar)
- `frontend/src/features/eventos/EventosPage.tsx:194-240` — `EventForm` (a actualizar)
- `frontend/src/features/eventos/SeriesForm.tsx` — `SeriesForm` (a actualizar)
- `frontend/src/features/eventos/events-api.ts` — `useEvents` (a actualizar)

## Skills sugeridos

- `/tdd` — no negociable para la implementación
- `/codebase-design` — evaluar la forma del interface cuando se implemente
- `/domain-modeling` — ya activo, mantener el lenguaje ubicuo actualizado
