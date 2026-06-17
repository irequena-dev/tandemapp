## Parent

`docs/prd/tandem-fase-3-salud.md`

## What to build

El conjunto de herramientas MCP de Salud, que es el de **mayor valor manos-libres** y el único flujo de **mutación por voz** del MVP:

- `record_health_visit(child_name, visited_at, diagnosis, notes?)`
- `start_pauta(child_name, medication, dose, interval, duration)`
- `record_administration(pauta_id)` — con **guarda de duplicado** (misma ventana corta que el REST)
- `finish_pauta(pauta_id)`
- `list_active_pautas(child_name?)` — lectura mínima para que Claude elija la Pauta correcta antes de registrar/finalizar.

Reutilizan el contrato de seguridad MCP y el **matching estricto de Hijo** de la Fase 0; `child_name` por nombre exacto o error estructurado con Hijos válidos. La atribución de la Administración usa el Miembro del token. Backend sin NLP (ADR-0002): Claude extrae `interval`/`duration`/`dose`, el backend valida y persiste; conviene esquemas de herramienta muy claros.

## Acceptance criteria

- [ ] Las cinco herramientas funcionan bajo `Bearer` válido y respetan el aislamiento por Familia.
- [ ] `record_administration` aplica la guarda de duplicado (ventana corta) igual que el REST y atribuye al Miembro del token.
- [ ] `list_active_pautas` devuelve solo Pautas activas de la Familia (filtrable por `child_name`) como lectura mínima.
- [ ] `start_pauta`/`record_health_visit` resuelven `child_name` por matching estricto; si no encaja/ambiguo, error estructurado con Hijos válidos.
- [ ] Cubierto por la costura de herramientas MCP (alta, guarda de duplicado, finalizar, lectura mínima, matching estricto, aislamiento) contra Postgres real.

## Blocked by

- 01-visitas-medicas.md
- 03-administraciones-guarda-duplicado.md
