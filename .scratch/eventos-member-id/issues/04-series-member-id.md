Status: ready-for-agent

## Parent

`.scratch/eventos-member-id/PRD.md`

## What to build

Permitir crear Series recurrentes atribuidas a un Miembro. Cada Evento materializado hereda el `member_id`.

Incluye:
- `SeriesCreate.member_id: str | None = None`.
- `create_series`: propaga `member_id` a cada Evento materializado (junto a `child_id` existente).
- Frontend: `SeriesCreate` type añade `member_id`. `SeriesForm` reemplaza el `<select>` de Hijos por el selector con optgroups Hijos/Miembros + opción "Familia". Recibe `members` como prop.

## Acceptance criteria

- [ ] `POST /api/series` con `member_id` → 201, los Eventos materializados tienen `member_id` correcto
- [ ] `POST /api/series` sin `member_id` ni `child_id` → 201, Eventos materializados sin sujeto (Familia)
- [ ] `POST /api/series` con `member_id` de otra Familia → 403
- [ ] `GET /events` de los Eventos materializados incluye `member` expandido
- [ ] `SeriesForm` muestra selector con optgroups Hijos/Miembros + "Familia"
- [ ] Al crear una Serie de Miembro desde la UI, los Eventos materializados aparecen con chip del Miembro

## Blocked by

- `.scratch/eventos-member-id/issues/01-tracer-bullet-evento-miembro.md`
