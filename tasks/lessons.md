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
