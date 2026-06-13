# Token MCP por Miembro, no por Familia

El concepto original definía un token MCP por Familia. Lo cambiamos a un token por Miembro: cada miembro configura su propio token en Claude. Como un Miembro pertenece a exactamente una Familia, el token resuelve sin ambigüedad a esa Familia para RLS, y además permite atribuir cada acción dictada por voz al miembro concreto (p. ej. quién dio una Administración) y revocar tokens de forma individual.

## Consequences

- Hay más tokens que gestionar (uno por miembro en vez de uno por familia).
- El rate limiting y la revocación pasan a ser por miembro.
- Si en el futuro un Miembro pudiera pertenecer a varias Familias, el token tendría que pasar a estar atado a un par (miembro, familia); hoy no es el caso.
