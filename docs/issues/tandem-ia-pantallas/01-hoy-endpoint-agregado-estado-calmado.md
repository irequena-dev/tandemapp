## Parent

`docs/prd/tandem-ia-pantallas.md`

## What to build

El cimiento de la pantalla **Hoy**: el endpoint agregado `GET /api/today` y la pantalla cableada al API real (sustituyendo el mock), en su **estado calmado**. Es la base que cada fase **extiende** de forma incremental (degradación incremental): mientras una fase no esté construida, su parte de Hoy simplemente no aparece.

En esta primera entrega, con ninguna fase de dominio aún conectada, el endpoint devuelve la forma completa del contrato pero "vacía": `hero = null`, `timeline = []` y un `summary` con contadores en cero / valores nulos. La pantalla Hoy muestra el **héroe en estado calmado** ("Nada urgente ahora · todo en orden") y un timeline/`Más cosas` sin contenido accionable.

La forma de la respuesta (`TodayOut`, `HeroItem`, `TimelineEntry`) sigue el contrato de `docs/api-contract.md` §6, acotada a la Familia del JWT.

## Acceptance criteria

- [ ] Existe `GET /api/today` autenticado y acotado a la Familia, que devuelve `TodayOut` según el contrato (`hero`, `timeline`, `summary`).
- [ ] Sin datos de dominio, `hero` es `null`, `timeline` es `[]` y `summary` lleva los contadores en cero / nulos.
- [ ] La pantalla Hoy consume `GET /api/today` (sin mock) y muestra el estado calmado cuando no hay nada urgente.
- [ ] El resto de la app (shell de 5 pestañas, header con Ajustes) sigue navegando sin `OrganizationSwitcher`.
- [ ] Cubierto por la costura HTTP/REST (Postgres real) y la costura de ruta/página con MSW.

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
