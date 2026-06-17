## Parent

`docs/prd/tandem-fase-1-lista-compra.md`

## What to build

La entrada manos libres de la compra: la herramienta MCP `add_shopping_items(items: list[str])`, que permite a Claude apuntar **varios Ítems de golpe** ("pañales talla 4, leche y pan") dictándolos.

La herramienta reutiliza el contrato de seguridad MCP de la Fase 0 (`Authorization: Bearer`, resolución token → Miembro → Familia, contexto RLS por transacción) e inserta cada string como un Ítem en estado `pending` bajo la Familia del token. Tachar/limpiar **no** se exponen por voz en v1 (ADR: mutaciones por voz reservadas al flujo clínico). El backend no interpreta lenguaje natural (ADR-0002): Claude extrae la lista, el backend valida y persiste.

## Acceptance criteria

- [ ] `add_shopping_items(items)` inserta un Ítem `pending` por cada string bajo la Familia del token.
- [ ] La herramienta exige `Bearer` válido; un token inválido/revocado es rechazado antes de ejecutar.
- [ ] Los Ítems creados aparecen en la lista de la Familia correcta y **no** en otra Familia (aislamiento).
- [ ] Tachar y limpiar comprados **no** están expuestos como herramientas MCP.
- [ ] Cubierto por la costura de herramientas MCP (auth, inserción en `pending`, aislamiento) contra Postgres real.

## Blocked by

- 01-items-compra-alta-listado.md
