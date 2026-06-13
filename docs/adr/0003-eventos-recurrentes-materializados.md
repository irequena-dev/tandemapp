# Eventos recurrentes materializados, no calculados

La recurrencia de Eventos se modela con una Serie que, al crearse, genera cada repetición como un Evento individual y persistido (materialización), en lugar del patrón habitual de guardar una regla (RRULE) y calcular las ocurrencias al leer. Para que la materialización sea finita y no requiera un proceso periódico, toda Serie debe estar acotada (fecha de fin o número de ocurrencias).

## Considered Options

- **RRULE calculado al vuelo + tablas de excepciones/completadas**: más compacto, pero la lógica de "marcar/editar/cancelar solo esta ocurrencia" y el estado "hecho" por ocurrencia se vuelven complejos.
- **Materializar ocurrencias (elegido)**: cada ocurrencia es una fila Evento normal, con su fecha, su estado "hecho" y editable/borrable de forma independiente sin lógica especial.

## Consequences

- Marcar, editar o cancelar "solo esta ocurrencia" es trivial.
- Las Series no pueden ser indefinidas; deben acotarse.
- La Serie es solo un generador, no una entidad viva: no se reedita con efecto en cascada. Recalendarizar significa borrar las ocurrencias futuras y crear otra Serie, evitando así rastrear ocurrencias "modificadas/desligadas".
