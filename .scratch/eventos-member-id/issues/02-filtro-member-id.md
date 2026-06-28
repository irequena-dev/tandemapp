Status: ready-for-agent

## Parent

`.scratch/eventos-member-id/PRD.md`

## What to build

Filtrar Eventos por Miembro en la API y en el frontend.

Incluye:
- `GET /events?member_id=<id>`: filtra Eventos donde `member_id` coincide.
- `events-api.ts`: `useEvents` acepta `member_id` en filters y lo pasa como query param.

## Acceptance criteria

- [ ] `GET /events?member_id=<id>` devuelve solo Eventos con ese `member_id`
- [ ] `GET /events?member_id=<id>&type_id=<id>` combina filtros correctamente
- [ ] `GET /events?member_id=<id>` no devuelve Eventos de otra Familia (RLS)
- [ ] `useEvents({ member_id })` pasa `member_id` como query param en la petición HTTP

## Blocked by

- `.scratch/eventos-member-id/issues/01-tracer-bullet-evento-miembro.md`
