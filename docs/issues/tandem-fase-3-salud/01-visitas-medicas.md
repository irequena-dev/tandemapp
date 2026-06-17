## Parent

`docs/prd/tandem-fase-3-salud.md`

## What to build

El historial de **Visitas médicas** por Hijo de extremo a extremo: registro histórico con diagnóstico y notas/tratamiento libres (JSONB), distinto de una cita futura (que es un Evento de la Fase 4).

La tabla `health_visits` (`visited_at`, `diagnosis`, `notes` JSONB, `created_by`) lleva `family_id` y RLS; el REST expone CRUD/listado por Hijo. En **HijoDetail → Visitas médicas** se listan (con filtro por fecha), se **registra** una Visita desde la PWA, se **corrige/borra**, y el **detalle** muestra diagnóstico y notas/tratamiento. La Visita es histórica; no se convierte automáticamente en cita. Esquema y tipos en `docs/api-contract.md` §5.1.

## Acceptance criteria

- [ ] Existe la tabla `health_visits` (con `notes` JSONB) con RLS e índice `(child_id, visited_at DESC)`.
- [ ] REST: listar por Hijo, crear, obtener detalle, editar y borrar Visitas, acotado a la Familia.
- [ ] HijoDetail → Visitas médicas lista con filtro por fecha, permite registrar/corregir/borrar y abre el detalle (diagnóstico + notas).
- [ ] Las notas/tratamiento se persisten y recuperan correctamente como JSONB.
- [ ] Cubierto por la costura HTTP/REST (CRUD con JSONB en Postgres real) y la costura de ruta/página con MSW.

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
