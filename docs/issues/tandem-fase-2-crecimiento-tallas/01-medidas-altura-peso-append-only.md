## Parent

`docs/prd/tandem-fase-2-crecimiento-tallas.md`

## What to build

El registro de **Medidas** (altura, peso) de un Hijo de extremo a extremo, **append-only**: cada Medida se guarda con su fecha sin pisar la anterior, así se ve la evolución, y el **valor actual** es el más reciente por tipo.

La tabla `measurements` (`type ∈ {height, weight}`, `value`, `unit`, `measured_at`, `recorded_by`) lleva `family_id` y RLS; el REST expone histórico por Hijo y tipo, valor actual, alta, edición y borrado (correcciones). En **HijoDetail → Crecimiento** se muestra la evolución de altura/peso con el último valor destacado y se permite alta/corrección desde la PWA. Imita el *prior art* de la Fase 1. Esquema y tipos en `docs/api-contract.md` §2.1.

## Acceptance criteria

- [ ] Existe la tabla `measurements` con RLS e índice `(child_id, type, measured_at DESC)`.
- [ ] REST: listar histórico (con filtro por `type`), obtener `current` (más reciente por tipo), crear, editar y borrar Medidas, acotado a la Familia.
- [ ] Crear varias Medidas del mismo tipo las conserva todas (append-only) y `current` devuelve la más reciente.
- [ ] HijoDetail → Crecimiento muestra la evolución de altura y peso con el valor actual destacado y permite alta/corrección desde la PWA.
- [ ] Cubierto por la costura HTTP/REST (append-only + current + correcciones) y la costura de ruta/página con MSW.

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
