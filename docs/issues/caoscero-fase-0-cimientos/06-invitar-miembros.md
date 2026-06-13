## Parent

`docs/prd/caoscero-fase-0-cimientos.md`

## What to build

La capacidad de incorporar a otra persona (pareja, abuela, niñera) a la Familia, de extremo a extremo, apoyándose en el flujo de invitaciones de Organizations de Clerk. Desde la PWA, un Miembro invita a otra persona a su Familia; al aceptar, esa persona queda como Miembro de la misma Familia y comparte el acceso a sus datos (sujeto a RLS).

## Acceptance criteria

- [ ] Un Miembro puede invitar a otra persona a su Familia desde la PWA.
- [ ] Al aceptar la invitación, la persona queda persistida como Miembro de esa Familia (un Miembro → una Familia).
- [ ] El nuevo Miembro ve y puede operar sobre los datos de la Familia, y solo de esa Familia (RLS).
- [ ] Cubierto por la costura de request (el nuevo Miembro accede a datos de su Familia y no de otra) y la costura de ruta/página.

## Blocked by

- 02-aislamiento-rls.md
