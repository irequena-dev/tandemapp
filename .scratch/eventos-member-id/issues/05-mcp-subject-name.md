Status: ready-for-agent

## Parent

`.scratch/eventos-member-id/PRD.md`

## What to build

Refactorizar el MCP `create_event` para usar un solo campo `subject_name` con resolución polimórfica (Hijo o Miembro).

Incluye:
- Nuevo módulo `backend/app/mcp/subject_matching.py` con `resolve_subject_by_name(session, name) -> Child | Member | SubjectMatchError`:
  - Busca en `Child.name` y `Member.display_name` simultáneamente (matching exacto case-insensitive).
  - Excluye Miembros con `display_name = null`.
  - 0 coincidencias → `SubjectMatchError(reason="not_found")` con lista de nombres válidos.
  - 1 coincidencia → devuelve `Child` o `Member`.
  - 2+ coincidencias → `SubjectMatchError(reason="ambiguous")`.
- `do_create_event`: reemplaza `child_name` por `subject_name` (string opcional). Si resuelve a `Child`, asigna `child_id`. Si resuelve a `Member`, asigna `member_id`. Si no se proporciona, ambos null (Familia).
- Respuesta MCP unificada: `subject_name: str | None` + `subject_type: "child" | "member" | None` en lugar de `child_id`.
- `resolve_subject_by_name` convive con `resolve_child_by_name` — no migrar otras herramientas.

## Acceptance criteria

- [ ] `create_event` con `subject_name` de un Hijo → crea Evento con `child_id`, respuesta incluye `subject_name` y `subject_type: "child"`
- [ ] `create_event` con `subject_name` de un Miembro → crea Evento con `member_id`, respuesta incluye `subject_name` y `subject_type: "member"`
- [ ] `create_event` sin `subject_name` → crea Evento de la Familia, respuesta incluye `subject_name: null` y `subject_type: null`
- [ ] `create_event` con `subject_name` que no existe → error con lista de nombres válidos (Hijos + Miembros con display_name)
- [ ] `create_event` con `subject_name` ambiguo (coincide con ≥2 sujetos) → error de ambigüedad
- [ ] `create_event` con Miembro que tiene `display_name = null` → no se considera en el matching
- [ ] Los tests MCP existentes se actualizan para usar `subject_name` en lugar de `child_name`

## Blocked by

- `.scratch/eventos-member-id/issues/01-tracer-bullet-evento-miembro.md`
