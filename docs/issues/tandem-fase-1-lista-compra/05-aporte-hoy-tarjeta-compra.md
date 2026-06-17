## Parent

`docs/prd/tandem-fase-1-lista-compra.md`

## What to build

El aporte de la Fase 1 a la pantalla **Hoy**: la tarjeta "Compra" del bloque "Más cosas" con el **contador de pendientes** ("X por comprar"; tono suave si no hay nada), que navega a la pestaña Compra.

Extiende el endpoint agregado `GET /api/today` (creado en `tandem-ia-pantallas/01`) para que `summary.shopping_pending_count` refleje los Ítems pendientes de la Familia, y cablea la tarjeta correspondiente en la pantalla Hoy. Es el primer "inquilino" del contenedor "Más cosas".

## Acceptance criteria

- [ ] `GET /api/today` incluye `summary.shopping_pending_count` con el número de Ítems `pending` de la Familia.
- [ ] La pantalla Hoy muestra la tarjeta "Compra" con "X por comprar" (tono suave/calmado si es 0) y navega a la pestaña Compra.
- [ ] El contador respeta el aislamiento por Familia.
- [ ] Cubierto por la costura HTTP/REST (`/api/today` con Ítems pendientes) y la costura de ruta/página con MSW.

## Blocked by

- 01-items-compra-alta-listado.md
- `docs/issues/tandem-ia-pantallas/01-hoy-endpoint-agregado-estado-calmado.md`
