## Parent

`docs/prd/tandem-fase-0-cimientos.md`

## What to build

El servidor MCP remoto y su contrato de seguridad y de resolución de Hijo, que reutilizan todas las fases siguientes. El servidor valida la cabecera `Authorization: Bearer <token>` con comparación en tiempo constante (`secrets.compare_digest`), resuelve el token a su Miembro y, por tanto, a su Familia, y fija el contexto RLS de esa Familia para la operación.

Expone la primera herramienta de lectura mínima, `list_children`, y define el **contrato de matching estricto de Hijo**: cuando una herramienta recibe un `child_name`, se resuelve por nombre exacto (case-insensitive); si no hay coincidencia o es ambiguo, devuelve un error estructurado que incluye la lista de Hijos válidos para que el cliente (Claude) desambigüe. Este contrato no se vuelve a definir en fases posteriores; se reutiliza.

El rate limiting estricto por token se documenta como configuración del proxy inverso (fuera del código de la herramienta).

## Acceptance criteria

- [ ] El servidor MCP está montado y accesible como endpoint autenticado por `Bearer`.
- [ ] El token se valida con `secrets.compare_digest`; un token inválido o revocado es rechazado.
- [ ] El token resuelve a Miembro → Familia y fija el contexto RLS de esa Familia.
- [ ] `list_children` devuelve únicamente los Hijos de la Familia del token.
- [ ] El contrato de matching estricto está implementado y documentado: nombre exacto (case-insensitive); si no encaja o es ambiguo, error estructurado con la lista de Hijos válidos.
- [ ] Cubierto por la costura de herramientas MCP (auth, aislamiento, error de matching) contra Postgres real.

## Blocked by

- 03-gestion-hijos-pwa.md
- 04-token-mcp-ciclo-vida.md
