# Contrato de matching estricto de Hijo

Las herramientas MCP que reciban un `child_name` (todas las de fases siguientes: compra, salud, agenda…) resuelven el Hijo por **nombre EXACTO, case-insensitive**. Si no hay coincidencia o es ambigua, **no se inventa ni se elige** nada: se devuelve un **error estructurado** (`ChildMatchError` con `reason` `not_found`/`ambiguous`) que incluye **la lista de Hijos válidos** de la Familia, para que el cliente MCP (Claude) pida aclaración al Miembro. Es exactamente la user story 12: un nombre mal entendido al dictar no crea un Hijo fantasma ni opera sobre el equivocado, sino que fuerza la desambiguación.

El contrato vive en un **único resolver reutilizable**, `app/mcp/child_matching.resolve_child_by_name(session, name) -> Child | ChildMatchError`, definido aquí (issue 05) y consumido por todas las herramientas futuras. Esta fase **no** expone el matching como tool: la única tool es `list_children` (lectura mínima). Sin fuzzy, sin trimming, sin autocorrección: la comparación es `lower(name) == lower(:name)`.

## Considered Options

- **Matching fuzzy / por substring / autocorrección**: rechazado. Silenciosamente escogería el Hijo equivocado o crearía datos sucios; rompe la confianza y contradice la user story 12.
- **Levantar una excepción / devolver `None`**: rechazado. Un fallo de matching es un resultado *esperado* (no excepcional), y el cliente necesita la **lista de válidos** para desambiguar; `None` o una excepción opaca la pierden.

## Consequences

- Toda herramienta futura que reciba `child_name` **debe** enrutar por `resolve_child_by_name`; el `ChildMatchError` se traduce en la superficie MCP (error con la lista de válidos) para que Claude replantee la pregunta.
- La lista `valid_children` sigue el mismo orden que `list_children` (`birth_date, name`), consistente entre superficies.
- Cambiar la semántica (p. ej. admitir trimming o fuzzy) sería una desviación explícita de esta decisión y se haría conscientemente, actualizando este ADR.

## Relacionado: rate limiting por token

El rate limiting estricto por token MCP es **configuración del proxy inverso**, **fuera** del código de la herramienta (issue 05). Las tools no lo implementan; el proxy lo impone por token antes de alcanzar `/mcp`. Ver PRD Fase 0.
