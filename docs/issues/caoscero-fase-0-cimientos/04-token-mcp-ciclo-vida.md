## Parent

`docs/prd/caoscero-fase-0-cimientos.md`

## What to build

El ciclo de vida del token MCP por Miembro (ADR-0001), de extremo a extremo desde la PWA. Desde Ajustes, un Miembro genera su propio token de alta entropía (≥32 bytes), que se almacena con hash y se muestra una sola vez en claro, y puede revocarlo. Cada token queda asociado a su Miembro (y por tanto a su Familia).

Esta rebanada solo cubre la **gestión** del token; su uso para autenticar el servidor MCP es la rebanada 05.

## Acceptance criteria

- [ ] Existe la tabla `mcp_tokens` (`id`, `member_id`, hash del token, metadatos de revocación).
- [ ] Un Miembro puede generar un token de alta entropía desde Ajustes; el valor en claro se muestra una sola vez.
- [ ] El token se almacena con hash, nunca en claro.
- [ ] Un Miembro puede revocar su token.
- [ ] La gestión de tokens está acotada a la Familia/Miembro autenticado.
- [ ] Cubierto por la costura REST y la costura de ruta/página (MSW).

## Blocked by

- 02-aislamiento-rls.md
