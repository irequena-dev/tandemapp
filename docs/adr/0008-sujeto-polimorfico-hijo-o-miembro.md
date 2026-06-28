# Sujeto polimórfico: Hijo o Miembro

## Contexto

El dominio distingue dos roles: **Hijo** (sujeto pasivo de datos, no usa la app) y **Miembro** (actor, usa la app). Inicialmente solo los Hijos eran sujetos de entidades de dominio. La adición de Pautas para Miembros reveló que la frontera "actor vs sujeto" no es nítida: un Miembro también puede recibir tratamiento, tener citas médicas o ser destinatario de un Evento.

En producción ya se está workaround-eando: los Eventos de Miembros se crean con `child_id = null`, perdiendo la atribución — "cita médica de Ana" y "pagar el colegio" son indistinguibles.

Tres entidades necesitan el mismo patrón: **Pauta** (ya implementado), **Evento** (necesario), **Visita médica** (pendiente). Medidas y Tallas siguen siendo exclusivas de Hijos.

## Decisión

El sujeto de una entidad de dominio puede ser un **Hijo** o un **Miembro**, mediante asociación polimórfica con dos FKs opcionales: `child_id` y `member_id`. La cardinalidad depende de la entidad:

- **Pauta**: exactamente uno (`child_id XOR member_id`). Un tratamiento siempre tiene un sujeto.
- **Visita médica**: exactamente uno (`child_id XOR member_id`). Una consulta siempre tiene un sujeto.
- **Evento**: cero o uno (`child_id` y `member_id` ambos opcionales). Un Evento puede ser de la Familia (ambos null), de un Hijo, o de un Miembro.

**No se unifican Hijo y Miembro en una sola entidad.** Son conceptos distintos con campos, relaciones y ciclos de vida diferentes. El solapamiento (ser sujeto de Pautas/Eventos/Visitas) no justifica la unificación — el polimorfismo localizado es más barato y reversible.

## Considered Options

- **Unificar Hijo y Miembro en "Persona" con `type`**: rechazado. Un Miembro tiene Clerk identity, push subscriptions, MCP tokens; un Hijo tiene birth_date, Medidas, Tallas. El solapamiento real es solo Pautas/Eventos/Visitas. Unificar arrastra nullable fields por todas partes, conditionales según `type`, y conceptualmente confunde actor con sujeto. Coste alto, irreversibilidad alta, beneficio limitado.

- **Polimorfismo caso por caso sin ADR**: rechazado. Tres entidades con el mismo patrón no son coincidencia — es una decisión de dominio. Documentarla evita que cada caso se trate como excepción ad-hoc y pone la frontera: "el polimorfismo se aplica donde el caso de uso lo justifica, no es universal".

## Consequences

- `HealthVisit.child_id` pasa a nullable; se añade `HealthVisit.member_id` (FK a `members.id`). Migración de DB.
- `Event` añade `member_id` (FK a `members.id`, nullable). Los Eventos existentes con `child_id = null` siguen siendo "de la Familia" — no hay migración de datos, pero los nuevos Eventos de Miembros usarán `member_id`.
- `PautaCreate` deja de prohibir `health_visit_id` cuando el sujeto es Miembro — la Visita médica de un Miembro puede originar su Pauta.
- `CONTEXT.md`: la definición de **Visita médica** y **Evento** se actualizan para reflejar que el sujeto puede ser Hijo o Miembro (o Familia, en Evento).
- MCP: `resolve_child_by_name` (ADR-0006) necesitará un equivalente para Miembros cuando se añadan herramientas que reciban `member_name`.
- Medidas y Tallas **no** se ven afectadas — siguen siendo exclusivas de Hijos.
