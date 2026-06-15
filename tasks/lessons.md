# Lessons

## RLS: el runtime NO puede conectar como superusuario/owner

PostgreSQL **ignora RLS para superusuarios y para el owner de la tabla**, incluso con `FORCE ROW LEVEL SECURITY`. Si el backend conecta con el rol owner (lo natural con `POSTGRES_USER`), la "red de seguridad" RLS no existe y los tests de denegación pasarían en falso. Regla: el runtime conecta con un rol **NOSUPERUSER** dedicado (`tandem_app`); las migraciones corren como owner. Cualquier tabla family-scoped nueva necesita su **propia** política RLS (no se hereda).

## pytest-asyncio + SQLAlchemy async: un solo event loop por sesión

El pool de conexiones de `asyncpg` queda atado al event loop en el que se creó (engine cacheado con `@lru_cache`). Con `asyncio_mode=auto` y loop por test, el segundo test que toca la DB revienta con "got Future attached to a different loop". Fijar en `pyproject.toml`:
`asyncio_default_fixture_loop_scope = "session"` y `asyncio_default_test_loop_scope = "session"`.

## SET LOCAL parametrizado de forma segura

No se puede bindear `SET LOCAL app.x = :v`. Usar `SELECT set_config('app.current_family_id', :value, true)` (el `true` = transaction-local) con bind param. Para `ALTER ROLE ... PASSWORD` (statement utility, no acepta binds) interpolar con `format(... %L ...)` leyendo el valor de un GUC fijado con `set_config`.

## Tests de aislamiento sin JWT real de Clerk

No podemos firmar JWTs reales en test. Sustituir **solo** la frontera externa con `app.dependency_overrides[require_auth]` (un dict `identity` mutable) y dejar el resto del pipeline real (materialización, `SET LOCAL`, RLS) contra Postgres real. Mantener un `client` aparte SIN override para seguir testeando el rechazo real de Clerk.

## Identities de test GLOBALLY únicas (no reutilizar user_id entre Familias)

Todos los tests comparten **un** Postgres efímero por sesión de pytest. `family_session` hace upsert del Miembro con `ON CONFLICT (id) DO UPDATE SET family_id = EXCLUDED.family_id`. Si dos tests reutilizan el mismo `user_id` (p. ej. `user_a`) bajo Familias **distintas**, ese `UPDATE family_id` cruza Familias y RLS lo rechaza (`InsufficientPrivilegeError` en `members`) → test roto por orden/aislamiento, no por lógica. Regla: cada test usa identities únicas con prefijo propio (p. ej. `org_mcp_a`/`user_mcp_a`). Antes de añadir un test, `grep -rE '_as\(identity, "[a-z0-9_]+"' tests/` para evitar colisiones.

## Subagentes en paralelo: su "full suite" puede ser ruido

Cuando dos subagentes corren a la vez sobre el mismo árbol, cada uno lee los ficheros del otro a mitad de escritura y cada `pytest`/`ruff` que lanzan refleja un estado parcial. Reportes como "hay un F821 pre-existente en X.py" o "el suite falla en 1" suelen ser artefactos de esa carrera, no defectos reales. Regla: el hilo orquestador **re-ejecuta** `pytest` + `ruff` secuencialmente sobre el estado final antes de dar por buena una ronda. No fiarse de los conteos de los subagentes paralelos.
