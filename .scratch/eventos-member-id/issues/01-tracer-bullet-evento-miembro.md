Status: ready-for-agent

## Parent

`.scratch/eventos-member-id/PRD.md`

## What to build

Tracer bullet end-to-end: crear un Evento atribuido a un Miembro y verlo en la lista de Eventos.

Incluye:
- Migración DB: añadir `events.member_id` (VARCHAR, FK a `members.id`, nullable, indexado). Sin CHECK constraint.
- Modelo `Event.member_id` (FK a `members.id`, nullable).
- DTO `MemberOut = { id: str, display_name: str | None }`.
- `EventCreate.member_id: str | None = None`.
- `EventOut.member_id: str | None` + `member: MemberOut | None`.
- `POST /events`: acepta `member_id`, valida pertenencia a la Familia (403 si no pertenece). `_enrich` expande `member` igual que expande `child`.
- `GET /events`: devuelve `member_id` y `member` expandido en cada EventOut.
- Frontend types: `EventOut.member_id` + `EventOut.member` (`MemberSummary`), `EventCreate.member_id`.
- `EventForm`: selector con optgroups "Hijos" / "Miembros" + opción "Familia" (value vacío). Recibe `members` como prop. Valor compuesto `child:${id}` / `member:${id}`. Patrón de `PautaForm.tsx`.
- Lista de Eventos: chip de Miembro (`{ev.member && <span className="evento-chip">{ev.member.display_name}</span>}`) junto al chip de Hijo existente.
- `events-api.ts`: `createEvent` envía `member_id` en el body.

## Acceptance criteria

- [ ] `POST /events` con `member_id` válido → 201, respuesta incluye `member_id` y `member` expandido (`{ id, display_name }`)
- [ ] `POST /events` con `member_id` de otra Familia → 403
- [ ] `POST /events` sin `member_id` ni `child_id` → 201 (Evento de la Familia)
- [ ] `POST /events` con ambos `member_id` y `child_id` → 201 (ambos sujetos)
- [ ] `GET /events` devuelve `member_id` y `member` en cada EventOut
- [ ] El formulario de Evento muestra selector con optgroups Hijos/Miembros y opción "Familia"
- [ ] Al crear un Evento de Miembro desde la UI, aparece en la lista con chip del nombre del Miembro
- [ ] Al crear un Evento con ambos sujetos desde la UI, aparecen ambos chips
- [ ] Migración aplica sin error sobre DB existente

## Blocked by

None - can start immediately
