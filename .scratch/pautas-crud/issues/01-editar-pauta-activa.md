# 01 — Editar Pauta activa (PATCH)

Status: ready-for-agent

## What to build

Permitir editar los campos de tratamiento de una Pauta activa: `medication`, `dose`, `interval_hours` y `duration_days`. El sujeto (`child_id`/`member_id`) y la visita asociada (`health_visit_id`) NO son editables — si el sujeto es incorrecto, se borra y se crea otra Pauta.

`ends_at` se recalcula desde el `started_at` original (no se toca `started_at`). Las Administraciones ya registradas se conservan intactas. Solo Pautas con `status = 'active'` son editables; intentar editar una finalizada devuelve 409.

Capas:
- **Backend**: modelo `PautaUpdate` (4 campos opcionales). Endpoint `PATCH /pautas/{pauta_id}` que valida estado activo, aplica los campos presentes y devuelve `PautaOut` enriquecido. Tests HTTP: edición exitosa, 409 en finalizada, 404 en otra Familia (RLS), campos calculados correctos tras edición.
- **Frontend**: hook `useUpdatePauta` con optimistic update y rollback (patrón existente en `api.ts`). `PautaForm` acepta un prop `initialValues` y modo edición (botón "Guardar" en vez de "Registrar", sin selector de sujeto). En `PautaCard` expandida (solo activas), botón "Editar" que muestra el formulario inline con los valores actuales. Al guardar o cancelar, vuelve a la vista normal. Aplica en `/pautas` (PautasPage) y en la ficha de Hijo (HijoDetailPage). NO aplica en el dashboard Hoy.
- **Tests frontend**: hook `useUpdatePauta` (api.test.tsx) + interacción editar en PautaCard/PautasPage (PautasPage.test.tsx).

## Acceptance criteria

- [ ] `PATCH /pautas/{id}` con body parcial actualiza solo los campos enviados y devuelve la Pauta enriquecida con `ends_at`/`day_number`/`next_dose_at` recalculados.
- [ ] Editar `duration_days` recalcula `ends_at` desde el `started_at` original sin tocar `started_at` ni las Administraciones.
- [ ] Intentar editar una Pauta finalizada devuelve 409.
- [ ] RLS: una Familia no puede editar la Pauta de otra (404).
- [ ] En PautaCard expandida (solo activas), el botón "Editar" muestra PautaForm con los valores actuales; "Guardar" persiste y cierra el formulario; "Cancelar" cierra sin cambios.
- [ ] El formulario en modo edición no muestra el selector de sujeto ni de visita asociada.
- [ ] TDD: tests primero. `pnpm test:backend` (Docker), `pnpm test:frontend`, `pnpm lint` y `pnpm -C frontend exec tsc -b` pasan.

## Blocked by

- None - can start immediately

## Comments

<!-- Conversation history appends here -->
