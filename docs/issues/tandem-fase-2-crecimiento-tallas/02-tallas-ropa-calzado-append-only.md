## Parent

`docs/prd/tandem-fase-2-crecimiento-tallas.md`

## What to build

El registro de **Tallas** (ropa, calzado) de un Hijo de extremo a extremo, **append-only**: etiquetas de texto libre con su fecha; la **actual** es la más reciente por tipo, para acertar al comprar.

La tabla `sizes` (`type ∈ {clothing, footwear}`, `label` p. ej. "5-6 años" / "29" / "24-36 meses", `recorded_at`, `recorded_by`) lleva `family_id` y RLS; el REST expone histórico por Hijo y tipo, talla actual, alta, edición y borrado. En **HijoDetail** se muestra la **talla** actual (clothing) y la de **calzado** (footwear) bien visibles. El tipo `clothing` se muestra como **"Talla"** (no "Ropa") y `footwear` como **"Calzado"**. Esquema y tipos en `docs/api-contract.md` §2.2.

## Acceptance criteria

- [ ] Existe la tabla `sizes` con RLS e índice `(child_id, type, recorded_at DESC)`.
- [ ] REST: listar histórico (con filtro por `type`), obtener `current` por tipo, crear, editar y borrar Tallas, acotado a la Familia.
- [ ] Append-only: varias Tallas del mismo tipo se conservan y `current` devuelve la más reciente.
- [ ] HijoDetail muestra la Talla (clothing → "Talla") y el Calzado (footwear → "Calzado") actuales y permite alta/corrección desde la PWA.
- [ ] Cubierto por la costura HTTP/REST y la costura de ruta/página con MSW.

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
