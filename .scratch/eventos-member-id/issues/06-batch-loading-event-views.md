Status: ready-for-agent

## Parent

`.scratch/eventos-member-id/PRD.md`

## What to build

Refactorizar `_enrich` en events.py a batch-loading para evitar N+1 queries al listar Eventos.

Incluye:
- Nueva función `load_event_views(session, events) -> list[EventOut]` que:
  - Recolecta todos los `child_ids`, `member_ids` y `event_type_ids` de los Eventos.
  - Hace un `SELECT ... WHERE id IN (...)` por cada conjunto (Child, Member, EventType).
  - Construye los `EventOut` desde los dicts, calculando `is_overdue` para cada uno.
- `_enrich` se reemplaza por `load_event_views` en todos los endpoints de events.py.
- `today.py` usa `load_event_views` en lugar de `_enrich` (importar desde events.py o extraer a módulo compartido).
- Patrón de referencia: `pautas_service.load_pauta_views`.

## Acceptance criteria

- [ ] Todos los tests existentes de `test_events.py` siguen pasando sin modificación
- [ ] Todos los tests existentes de `test_today.py` siguen pasando sin modificación
- [ ] `GET /events` con N Eventos hace como máximo 3 queries batch (Child, Member, EventType) + 1 query de Eventos, no N+1
- [ ] `EventOut` incluye `member` expandido correctamente tras el refactor

## Blocked by

- `.scratch/eventos-member-id/issues/01-tracer-bullet-evento-miembro.md`
