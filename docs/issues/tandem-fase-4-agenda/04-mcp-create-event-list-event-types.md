## Parent

`docs/prd/tandem-fase-4-agenda.md`

## What to build

La entrada manos libres de la agenda: las herramientas MCP `create_event(title, date, time?, type, child_name?)` (solo **Eventos sueltos**, sin recurrencia por voz) y `list_event_types()` (lectura mínima para que la IA elija un tipo válido).

Reutilizan el contrato de seguridad MCP y el **matching estricto de Hijo** de la Fase 0. La IA elige entre los tipos existentes; si **ninguno encaja, se usa "Otros"** (el dictado nunca se atasca por la categoría). La creación de Series y de Tipos **no** se expone por voz. Backend sin NLP (ADR-0002): Claude extrae los datos, el backend valida y persiste.

## Acceptance criteria

- [ ] `create_event` crea un Evento suelto bajo la Familia del token, con tipo válido y `child_name` opcional resuelto por matching estricto.
- [ ] Si el tipo dictado no encaja con ninguno existente, el Evento se crea con tipo "Otros" (fallback), sin error.
- [ ] La herramienta **rechaza** intentos de recurrencia por voz (las Series son solo PWA).
- [ ] `list_event_types()` devuelve los tipos base + propios de la Familia como lectura mínima.
- [ ] Las herramientas exigen `Bearer` válido y respetan el aislamiento por Familia.
- [ ] Cubierto por la costura de herramientas MCP (alta, fallback a "Otros", rechazo de recurrencia, lectura mínima, matching estricto, aislamiento) contra Postgres real.

## Blocked by

- 01-tipos-de-evento.md
- 02-eventos-sueltos.md
