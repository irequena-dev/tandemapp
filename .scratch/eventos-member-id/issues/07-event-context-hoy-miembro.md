Status: ready-for-agent

## Parent

`.scratch/eventos-member-id/PRD.md`

## What to build

Actualizar `_event_context` en `today.py` para mostrar el nombre del Miembro y concatenar ambos sujetos cuando un Evento tiene Hijo y Miembro.

Incluye:
- `_event_context(ev: EventOut) -> str | None`:
  - Si `ev.child` y `ev.member` ambos presentes → `f"{ev.child.name} · {ev.member.display_name}"`
  - Si solo `ev.child` → `ev.child.name`
  - Si solo `ev.member` → `ev.member.display_name`
  - Si ninguno → `ev.event_type.name` si existe, si no `None`

## Acceptance criteria

- [ ] El héroe "Hoy" muestra el nombre del Miembro cuando el Evento más inminente es de un Miembro
- [ ] El héroe "Hoy" muestra "Mateo · Ana" cuando el Evento tiene ambos sujetos
- [ ] El héroe "Hoy" sigue mostrando el nombre del Hijo cuando el Evento es solo de un Hijo
- [ ] El héroe "Hoy" sigue mostrando el tipo de Evento cuando no hay sujeto
- [ ] Los tests existentes de `test_today.py` siguen pasando

## Blocked by

- `.scratch/eventos-member-id/issues/01-tracer-bullet-evento-miembro.md`
