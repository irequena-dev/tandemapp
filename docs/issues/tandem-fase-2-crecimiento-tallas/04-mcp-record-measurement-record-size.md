## Parent

`docs/prd/tandem-fase-2-crecimiento-tallas.md`

## What to build

La entrada manos libres de crecimiento y tallas: las herramientas MCP `record_measurement(child_name, type, value, unit)` (`type ∈ {height, weight}`) y `record_size(child_name, type, label)` (`type ∈ {clothing, footwear}`).

Reutilizan el contrato de seguridad MCP y el **matching estricto de Hijo** de la Fase 0: `child_name` se resuelve por nombre exacto (case-insensitive); si no encaja o es ambiguo, error estructurado con la lista de Hijos válidos. Los **tipos son un conjunto fijo y curado** en código: la IA debe encajar en uno o recibir error (no inventa tipos). Backend sin NLP (ADR-0002): Claude extrae los datos estructurados, el backend valida y persiste.

## Acceptance criteria

- [ ] `record_measurement` inserta una Medida (`height`/`weight`) y `record_size` una Talla (`clothing`/`footwear`) bajo la Familia del token.
- [ ] Un `type` fuera del conjunto curado se rechaza con error estructurado (la IA no crea tipos).
- [ ] `child_name` usa matching estricto; si no encaja/ambiguo, error estructurado con los Hijos válidos.
- [ ] Las herramientas exigen `Bearer` válido y respetan el aislamiento por Familia.
- [ ] Cubierto por la costura de herramientas MCP (tipos válidos/ inválidos, matching estricto, aislamiento) contra Postgres real.

## Blocked by

- 01-medidas-altura-peso-append-only.md
- 02-tallas-ropa-calzado-append-only.md
