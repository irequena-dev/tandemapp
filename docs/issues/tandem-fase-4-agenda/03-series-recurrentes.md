## Parent

`docs/prd/tandem-fase-4-agenda.md`

## What to build

Las **Series recurrentes** acotadas (ADR-0003) para lo periódico (p. ej. "extraescolar los martes hasta junio"), creadas **solo en la PWA**.

La tabla `series` (`cadence` weekly/biweekly/monthly, `day_of_week`, `starts_at`, `ends_at`/`max_count` — uno obligatorio) es **solo generador**: al crearse, **materializa todas las ocurrencias como Eventos independientes** (cada uno con su `series_id`), de modo que marcar/cancelar "solo esta vez" no afecta al resto. `POST /api/series` devuelve cuántas ocurrencias creó; `DELETE /api/series/{id}/future` borra las **futuras** sin tocar las pasadas/marcadas. Sin edición en cascada: recalendarizar = borrar futuras + crear otra Serie. La PWA ofrece alta de Serie con **previsualización de ocurrencias** y "borrar futuras de esta serie". Esquema y tipos en `docs/api-contract.md` §4.3.

## Acceptance criteria

- [ ] Existe la tabla `series` con RLS; `POST /api/series` materializa el número correcto de Eventos acotados (`ends_at` o `max_count`) y devuelve `events_created`.
- [ ] Cada ocurrencia es un Evento independiente con `series_id`; marcar/borrar una no afecta a las demás.
- [ ] `DELETE /api/series/{id}/future` borra las ocurrencias futuras sin tocar las ya pasadas/marcadas.
- [ ] La PWA (dentro de Eventos) permite crear una Serie con preview de ocurrencias y borrar las futuras.
- [ ] Cubierto por la costura HTTP/REST (materialización acotada, borrado de futuras) y la costura de ruta/página con MSW.

## Blocked by

- 02-eventos-sueltos.md
