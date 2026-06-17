## Parent

`docs/prd/tandem-fase-4-agenda.md`

## What to build

Los **Eventos sueltos** de extremo a extremo: cosas que ocurren o vencen en una fecha, con hora opcional (sin hora = día completo) y opcionalmente ligadas a 0 o 1 Hijo.

La tabla `events` (`title`, `date`, `time` nullable, `event_type_id`, `child_id` nullable, `status`, `series_id` nullable) lleva `family_id` y RLS. `is_overdue` es **calculado** en lectura (`status=pending && date < hoy`), no se persiste. El REST expone CRUD + `done`/`undo` (estado **solo manual**: pasar la fecha no completa nada) + filtros por tipo/Hijo. La pestaña **Eventos** es una **lista de próximos** (no calendario) con los 3 estados visuales: Hecho (verde), Atrasado (rojo), Pendiente; crear/editar/borrar + marcar hecho/deshacer con optimistic. Esquema y tipos en `docs/api-contract.md` §4.1.

## Acceptance criteria

- [ ] Existe la tabla `events` con RLS e índices `(family_id, date)`, `(event_type_id)`, `(child_id)`.
- [ ] REST: crear (con/sin hora, con/sin Hijo), listar con filtros `type_id`/`child_id`, editar, borrar, `done` y `undo`, acotado a la Familia.
- [ ] `is_overdue` se calcula en lectura; un Evento pasado sin marcar se reporta atrasado; `done` es solo manual.
- [ ] La pestaña Eventos lista próximos con los 3 estados, filtra por tipo y Hijo, y permite crear/editar/borrar + marcar hecho/deshacer con optimistic update.
- [ ] Cubierto por la costura HTTP/REST (estados, overdue, filtros) y la costura de ruta/página con MSW.

## Blocked by

- 01-tipos-de-evento.md
