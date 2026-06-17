## Parent

`docs/prd/tandem-fase-3-salud.md`

## What to build

El aporte de la Fase 3 a la pantalla **Hoy**, el de mayor valor: la **próxima toma** pendiente alimenta el **héroe "Ahora"** y el **timeline del día**, más la tarjeta "Pautas" de "Más cosas".

Extiende `GET /api/today` (creado en `tandem-ia-pantallas/01`):
- **Héroe "Ahora"**: prioriza una Administración **vencida o inminente** (medicación + Hijo, día X de Y) con acción "Marcar toma" + Deshacer.
- **Timeline**: por cada Pauta activa, la próxima toma calculada + las Administraciones **ya dadas hoy** como hitos.
- **Summary**: `pautas_active_count` / `pautas_finished_count`.

La prioridad del héroe (toma sobre Evento) se respeta aunque la Fase 4 también aporte; el estado calmado se mantiene si no hay toma ni evento.

## Acceptance criteria

- [ ] `GET /api/today` puebla `hero` con la próxima toma vencida/inminente (tipo `pauta_dose`) cuando exista, con su `action_label` y `pauta_id`.
- [ ] El `timeline` incluye, por Pauta activa, la próxima toma (`dose_upcoming`) y las Administraciones dadas hoy (`dose_given`).
- [ ] `summary.pautas_active_count` y `pautas_finished_count` reflejan el estado de las Pautas de la Familia.
- [ ] La pantalla Hoy muestra el héroe con acción "Marcar toma" + Deshacer y el timeline de tomas; la tarjeta Pautas resume activas/finalizadas.
- [ ] Cubierto por la costura HTTP/REST (`/api/today` con Pautas/Administraciones) y la costura de ruta/página con MSW.

## Blocked by

- 03-administraciones-guarda-duplicado.md
- `docs/issues/tandem-ia-pantallas/01-hoy-endpoint-agregado-estado-calmado.md`
