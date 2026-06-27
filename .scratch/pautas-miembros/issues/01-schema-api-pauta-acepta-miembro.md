# 01 — Schema + API: Pauta acepta Miembro como sujeto

Status: ready-for-agent

## What to build

Tracer bullet que abre el modelo de Pauta a Miembros adultos como sujeto de tratamiento. Hoy `child_id` es NOT NULL; tras este slice un Miembro de la Familia puede ser sujeto de una Pauta con la misma semántica (medicamento, dosis, intervalo, duración, Administraciones).

Alcance:

- **DB migración**: `ALTER TABLE pautas ALTER COLUMN child_id DROP NOT NULL`, `ADD COLUMN member_id UUID REFERENCES members(id)`, CHECK constraint `(child_id IS NOT NULL) != (member_id IS NOT NULL)` (exactamente uno relleno). Índice en `member_id`.
- **Modelo `Pauta`**: `child_id` pasa a `uuid.UUID | None`, se añade `member_id: uuid.UUID | None`.
- **`PautaCreate`**: acepta `child_id: UUID | None` + `member_id: UUID | None`; validación pydantic que exige exactamente uno.
- **`PautaOut`**: incluye `member_id: UUID | None` + `subject_name: str` (resuelto por el backend vía join con `children` o `members`).
- **Endpoint `POST /pautas`**: valida que el `member_id` existe y pertenece a la Familia del JWT (misma lógica que `child_id`). Si sujeto es Miembro, `health_visit_id` debe ser NULL (400 si se envía).
- **Endpoint `GET /pautas`**: el join para resolver `subject_name` opera sobre ambas FK. Sin filtro por tipo de sujeto — devuelve todas las pautas de la Familia.
- **Avisos/poller**: verificar que la query del poller de Administración no filtra por `child_id IS NOT NULL`; si lo hace, eliminar ese filtro.
- **CONTEXT.md**: actualizar definición de Pauta — "Instrucción de tratamiento activa para un Hijo o un Miembro de la Familia".

## Acceptance criteria

- [ ] Migración aplica limpiamente; rollback funciona.
- [ ] `POST /pautas` con `member_id` (sin `child_id`) crea la Pauta y devuelve `subject_name` = display_name del Miembro.
- [ ] `POST /pautas` con ambos (`child_id` + `member_id`) devuelve 422.
- [ ] `POST /pautas` con `member_id` + `health_visit_id` devuelve 400.
- [ ] `POST /pautas` con `member_id` de otra Familia devuelve 403/404.
- [ ] `GET /pautas` devuelve pautas de Hijos y Miembros mezcladas, cada una con `subject_name`.
- [ ] Pautas existentes (con `child_id`) siguen funcionando sin cambios.
- [ ] El poller de avisos dispara notificaciones para pautas de Miembros igual que para Hijos.
- [ ] TDD: tests primero. `pnpm test:backend`, `pnpm lint` pasan.

## Blocked by

- None - can start immediately
