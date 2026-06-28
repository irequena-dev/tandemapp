Status: ready-for-agent

## Parent

`.scratch/eventos-member-id/PRD.md`

## What to build

Permitir editar el sujeto Miembro de un Evento existente via PATCH.

Incluye:
- `EventUpdate.member_id: str | None = None`.
- `PATCH /events/{id}`: si `member_id` está en el patch, valida pertenencia a la Familia (403 si no pertenece).
- Frontend: `EventUpdate` type añade `member_id`. Modo edición de `EventForm` precarga el sujeto actual (Hijo, Miembro o Familia) y permite cambiarlo.

## Acceptance criteria

- [ ] `PATCH /events/{id}` con `member_id` válido → 200, respuesta incluye `member` expandido
- [ ] `PATCH /events/{id}` con `member_id` de otra Familia → 403
- [ ] `PATCH /events/{id}` con `member_id: null` → 200 (quita atribución a Miembro)
- [ ] `PATCH /events/{id}` sin `member_id` en el body → no modifica el `member_id` existente
- [ ] Desde la UI, al editar un Evento, el selector muestra el sujeto actual y permite cambiarlo

## Blocked by

- `.scratch/eventos-member-id/issues/01-tracer-bullet-evento-miembro.md`
