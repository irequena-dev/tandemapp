## Parent

`docs/prd/tandem-fase-3-salud.md`

## What to build

Las **Administraciones** de una Pauta: marcar que se ha dado una dosis, ver **cuándo y quién** dio la última, y recalcular la **siguiente toma** (`next_dose_at` = última Administración + `interval_hours`).

La tabla `administrations` (`pauta_id`, `administered_at`, `administered_by`) lleva `family_id` y RLS. Incluye la **guarda de duplicado** (no idempotencia global): si llega otra Administración de la misma Pauta dentro de una ventana corta (~15 min, parametrizable), se ignora y se devuelve la existente con `200` en vez de `201`, protegiendo el cálculo y evitando doble dosis aparente. La pestaña Pautas muestra las **tomas del día** con estado (Dada / Próxima / Pendiente) + quién, botón **"Marcar toma"** con optimistic + deshacer; al **borrar** una Administración se recalcula la siguiente. Esquema y tipos en `docs/api-contract.md` §5.3.

## Acceptance criteria

- [ ] Existe la tabla `administrations` con RLS e índice `(pauta_id, administered_at DESC)`.
- [ ] REST: listar, crear, editar y borrar Administraciones de una Pauta; cada una guarda `administered_by` (Miembro) y `administered_at`.
- [ ] `next_dose_at` se calcula como última Administración + `interval_hours`; borrar una Administración recalcula la siguiente.
- [ ] Guarda de duplicado: una segunda Administración dentro de la ventana corta no crea otra y devuelve la existente con `200`.
- [ ] La pestaña Pautas muestra tomas del día con estado + quién, marca toma con optimistic + deshacer.
- [ ] Cubierto por la costura HTTP/REST (cálculo, guarda de duplicado, recálculo al borrar) y la costura de ruta/página con MSW.

## Blocked by

- 02-pautas-iniciar-listar-finalizar.md
