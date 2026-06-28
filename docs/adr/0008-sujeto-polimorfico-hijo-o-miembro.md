# Sujeto polimórfico: Hijo o Miembro

## Contexto

El dominio distingue dos roles: **Hijo** (sujeto pasivo de datos, no usa la app) y **Miembro** (actor, usa la app). Inicialmente solo los Hijos eran sujetos de entidades de dominio. La adición de Pautas para Miembros reveló que la frontera "actor vs sujeto" no es nítida: un Miembro también puede recibir tratamiento, tener citas médicas o ser destinatario de un Evento.

En producción ya se está workaround-eando: los Eventos de Miembros se crean con `child_id = null`, perdiendo la atribución — "cita médica de Ana" y "pagar el colegio" son indistinguibles.

Tres entidades necesitan el mismo patrón: **Pauta** (ya implementado), **Evento** (necesario), **Visita médica** (pendiente). Medidas y Tallas siguen siendo exclusivas de Hijos.

## Decisión

El sujeto de una entidad de dominio puede ser un **Hijo** o un **Miembro**, mediante asociación polimórfica con dos FKs opcionales: `child_id` y `member_id`. La cardinalidad depende de la entidad:

- **Pauta**: exactamente uno (`child_id XOR member_id`). Un tratamiento siempre tiene un sujeto.
- **Visita médica**: exactamente uno (`child_id XOR member_id`). Una consulta siempre tiene un sujeto.
- **Evento**: cero, uno o dos (`child_id` y `member_id` ambos opcionales e independientes, sin CHECK constraint entre ellos). Un Evento puede ser de la Familia (ambos null), de un Hijo, de un Miembro, o de ambos (p. ej. "Ana lleva a Mateo al pediatra").

**No se unifican Hijo y Miembro en una sola entidad.** Son conceptos distintos con campos, relaciones y ciclos de vida diferentes. El solapamiento (ser sujeto de Pautas/Eventos/Visitas) no justifica la unificación — el polimorfismo localizado es más barato y reversible.

## Considered Options

- **Unificar Hijo y Miembro en "Persona" con `type`**: rechazado. Un Miembro tiene Clerk identity, push subscriptions, MCP tokens; un Hijo tiene birth_date, Medidas, Tallas. El solapamiento real es solo Pautas/Eventos/Visitas. Unificar arrastra nullable fields por todas partes, conditionales según `type`, y conceptualmente confunde actor con sujeto. Coste alto, irreversibilidad alta, beneficio limitado.

- **Polimorfismo caso por caso sin ADR**: rechazado. Tres entidades con el mismo patrón no son coincidencia — es una decisión de dominio. Documentarla evita que cada caso se trate como excepción ad-hoc y pone la frontera: "el polimorfismo se aplica donde el caso de uso lo justifica, no es universal".

## Consequences

- `HealthVisit.child_id` pasa a nullable; se añade `HealthVisit.member_id` (FK a `members.id`). Migración de DB.
- `Event` añade `member_id` (FK a `members.id`, nullable). Los Eventos existentes con `child_id = null` siguen siendo "de la Familia" — no hay migración de datos, pero los nuevos Eventos de Miembros usarán `member_id`. No hay CHECK constraint entre `child_id` y `member_id` — ambos pueden ser non-null simultáneamente.
- `EventOut` añade `member_id: str | None` + `member: MemberOut | None` donde `MemberOut = { id, display_name }`. Sin `subject_name` — la UI lo deriva con un helper.
- `EventCreate` y `EventUpdate` añaden `member_id: str | None` con validación explícita de pertenencia a la Familia (igual que Pauta).
- `GET /events` acepta `?member_id=` como filtro adicional (simétrico con `?child_id=`).
- `_enrich` en events.py se refactoriza a batch-loading (`load_event_views`) — batch-loadea `Child`, `Member` y `EventType` con `SELECT ... WHERE id IN (...)`.
- `SeriesCreate` añade `member_id: str | None` y se propaga a cada Evento materializado.
- MCP: `child_name` se reemplaza por `subject_name` en `create_event`. Nuevo resolver polimórfico `resolve_subject_by_name` busca en Hijos y Miembros simultáneamente (matching exacto case-insensitive sobre `Child.name` y `Member.display_name`). Respuesta MCP unificada: `subject_name` + `subject_type` ("child" | "member" | null). `resolve_subject_by_name` convive con `resolve_child_by_name` — las herramientas de Hijos (Medidas, Tallas) siguen usando esta última; `record_health_visit`, `start_pauta` y `list_active_pautas` migrarán a `resolve_subject_by_name` en otra sesión.
- UI: lista plana sin agrupación ni filtro nuevo. Ambos chips (`child.name` + `member.display_name`) cuando ambos sujetos están presentes. Selector con optgroups Hijos/Miembros + opción "Familia" (vacío) en `EventForm` y `SeriesForm`. `_event_context` en today.py concatena ambos nombres ("Mateo · Ana").
- `PautaCreate` deja de prohibir `health_visit_id` cuando el sujeto es Miembro — la Visita médica de un Miembro puede originar su Pauta.
- `CONTEXT.md`: la definición de **Visita médica** y **Evento** se actualizan para reflejar que el sujeto puede ser Hijo o Miembro (o Familia, en Evento).
- MCP: `resolve_child_by_name` (ADR-0006) se complementa con `resolve_subject_by_name` (polimórfico) para `create_event`. Las herramientas `record_health_visit`, `start_pauta` y `list_active_pautas` migrarán a `resolve_subject_by_name` en otra sesión.
- Medidas y Tallas **no** se ven afectadas — siguen siendo exclusivas de Hijos.
