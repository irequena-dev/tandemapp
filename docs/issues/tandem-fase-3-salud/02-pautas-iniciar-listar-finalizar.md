## Parent

`docs/prd/tandem-fase-3-salud.md`

## What to build

Las **Pautas** (tratamientos) de extremo a extremo: iniciar una Pauta con medicamento, dosis, intervalo y duración; listarlas (activas/finalizadas) de **toda la Familia** (cross-Hijo); finalizarla manualmente; y exponer los campos **calculados** que guían la siguiente toma.

La tabla `pautas` (`medication`, `dose`, `interval_hours`, `duration_days`, `started_at`, `status`, `health_visit_id` nullable) lleva `family_id` y RLS. `ends_at` y `day_number` son **calculados** (no persistidos): `ends_at = started_at + duration_days`, `day_number = floor((now - started_at)/24h)+1`. La pestaña **Pautas** muestra la lista ordenada por urgencia, con avatar + nombre del Hijo, curso (día X de Y + barra de progreso) y las finalizadas **recesadas**; acciones iniciar y finalizar. El cálculo de `next_dose_at` y las tomas del día llegan en la rebanada 03 (Administraciones). Esquema y tipos en `docs/api-contract.md` §5.2.

## Acceptance criteria

- [ ] Existe la tabla `pautas` con RLS e índices `(family_id, status)` y `(child_id)`.
- [ ] REST: iniciar Pauta, listar (filtros `status`/`child_id`), obtener detalle, finalizar manualmente, acotado a la Familia; `health_visit_id` opcional.
- [ ] `ends_at` y `day_number` se devuelven calculados (no persistidos).
- [ ] La pestaña Pautas lista cross-Hijo ordenadas por urgencia, con avatar+nombre del Hijo, curso (día X/Y + progreso); las finalizadas aparecen recesadas; iniciar y finalizar desde la PWA.
- [ ] Cubierto por la costura HTTP/REST (cálculo de `ends_at`/`day_number`, finalizar manual) y la costura de ruta/página con MSW.

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
