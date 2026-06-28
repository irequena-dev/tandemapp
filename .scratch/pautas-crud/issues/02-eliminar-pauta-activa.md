# 02 — Eliminar Pauta activa (DELETE)

Status: ready-for-agent

## What to build

Permitir eliminar una Pauta activa con hard delete. Al borrar una Pauta se borran también todas sus Administraciones asociadas (CASCADE). Solo Pautas con `status = 'active'` son eliminables; intentar eliminar una finalizada devuelve 409.

La UI pide confirmación inline (patrón existente Sí/No, igual que "Finalizar Pauta") antes de ejecutar el DELETE.

Capas:
- **Backend**: endpoint `DELETE /pautas/{pauta_id}` que valida estado activo, borra las Administraciones asociadas y luego la Pauta, y devuelve 204. Tests HTTP: borrado exitoso (204 + desaparece del listado), CASCADE sobre Administraciones, 409 en finalizada, 404 en otra Familia (RLS).
- **Frontend**: hook `useDeletePauta` con optimistic update (elimina de la caché) y rollback. En `PautaCard` expandida (solo activas), botón "Eliminar" que al pulsarse muestra confirmación inline ("¿Eliminar la Pauta? Sí / No"). Al confirmar, ejecuta el DELETE y muestra toast de confirmación. Aplica en `/pautas` (PautasPage) y en la ficha de Hijo (HijoDetailPage). NO aplica en el dashboard Hoy.
- **Tests frontend**: hook `useDeletePauta` (api.test.tsx) + interacción eliminar con confirmación en PautaCard/PautasPage (PautasPage.test.tsx).

## Acceptance criteria

- [ ] `DELETE /pautas/{id}` borra la Pauta y sus Administraciones; devuelve 204.
- [ ] La Pauta desaparece del listado `GET /pautas` tras el borrado.
- [ ] Intentar eliminar una Pauta finalizada devuelve 409.
- [ ] RLS: una Familia no puede eliminar la Pauta de otra (404).
- [ ] En PautaCard expandida (solo activas), el botón "Eliminar" muestra confirmación inline (Sí/No); "Sí" ejecuta el DELETE; "No" cancela.
- [ ] Tras borrar, un toast confirma la acción.
- [ ] TDD: tests primero. `pnpm test:backend` (Docker), `pnpm test:frontend`, `pnpm lint` y `pnpm -C frontend exec tsc -b` pasan.

## Blocked by

- None - can start immediately

## Comments

<!-- Conversation history appends here -->
