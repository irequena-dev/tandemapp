## Parent

`docs/prd/tandem-fase-2-crecimiento-tallas.md`

## What to build

El **card de Hijo** de la pestaña Hijos enriquecido con las **métricas actuales**: altura, peso, talla de calzado y talla de ropa de un vistazo, para tenerlas a mano al salir de compras.

El backend ofrece `GET /api/children?include=current_metrics` devolviendo `ChildWithMetricsOut` (Hijo + `current_height_cm`, `current_weight_kg`, `current_talla`, `current_talla_calzado`), derivados de la última Medida/Talla por tipo. La pestaña Hijos consume esa vista y muestra las métricas en cada card. Esquema y tipos en `docs/api-contract.md` §1.3.1.

## Acceptance criteria

- [ ] `GET /api/children?include=current_metrics` devuelve cada Hijo con sus valores actuales (altura, peso, talla, talla de calzado) o `null` si no hay registro.
- [ ] Los valores actuales se derivan de la Medida/Talla más reciente por tipo (no se persisten aparte).
- [ ] La pestaña Hijos muestra, por card, altura/peso/talla/calzado actuales junto al avatar, nombre y edad.
- [ ] Acotado a la Familia (no se filtran métricas de Hijos de otras Familias).
- [ ] Cubierto por la costura HTTP/REST y la costura de ruta/página con MSW.

## Blocked by

- 01-medidas-altura-peso-append-only.md
- 02-tallas-ropa-calzado-append-only.md
