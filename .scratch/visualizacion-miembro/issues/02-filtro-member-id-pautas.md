## Parent

`.scratch/visualizacion-miembro/PRD.md`

## What to build

Añadir filtro `member_id` al endpoint `GET /pautas` en el backend, simétrico con el filtro `child_id` existente. En el frontend, `usePautas` acepta `member_id` como param y lo envía como query string. End-to-end: la query del detalle de un Miembro puede pedir solo sus Pautas al backend.

## Acceptance criteria

- [ ] `GET /pautas?member_id=<uuid>` devuelve solo las Pautas con ese `member_id`
- [ ] `GET /pautas` sin `member_id` devuelve todas (sin regresión)
- [ ] `GET /pautas?child_id=<uuid>&member_id=<uuid>` filtra por ambos (AND)
- [ ] `usePautas({ member_id: '...' })` envía el query param y usa query key distinta
- [ ] Test en `backend/tests/test_pautas.py`: crear Pautas con `member_id` y `child_id`, verificar filtro `?member_id=` devuelve solo las del Miembro. Prior art: `test_pauta_list_filters`

## Blocked by

None - can start immediately
