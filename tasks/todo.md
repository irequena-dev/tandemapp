# Issue 02 — Aislamiento multi-inquilino (RLS)

`docs/issues/tandem-fase-0-cimientos/02-aislamiento-rls.md`

## Decisiones (confirmadas con el usuario)

- **Esquema**: se introduce **Alembic** ahora (migraciones async wired a `app.config`).
- **Rol de aplicación**: la migración crea un rol `tandem_app` **NOSUPERUSER** con grants DML; el runtime conecta como ese rol (clave: superusuario/owner **ignora RLS**, incluso con FORCE).
- **Tabla de demostración**: el aislamiento en la costura de request se demuestra con **`members`** (read-only `GET /members`). La tabla `children` y su CRUD/UI quedan para la issue 03.

## Plan

- [ ] `alembic` añadido; `alembic/env.py` async tomando la URL de `Settings.database_url` (admin/owner).
- [ ] Modelos SQLModel `Family` y `Member` (PK de texto = id de Clerk; `members.family_id` → `families.id`).
- [ ] Migración inicial: tablas + `ENABLE/FORCE ROW LEVEL SECURITY` + políticas `family_id = current_setting('app.current_family_id', true)` + rol `tandem_app` + grants + default privileges.
- [ ] `Settings.app_database_url` derivada (mismo host/db, rol `tandem_app`); `database.get_engine()` runtime usa el rol app (RLS efectiva).
- [ ] Dependencia centralizada `family_scoped_session`: abre transacción, `set_config('app.current_family_id', org_id, true)`, materializa `Family`/`Member`, hace `yield` de la sesión.
- [ ] `GET /members` (acotado a la Familia) para ejercitar el aislamiento.
- [ ] Tests (TDD, Postgres real):
  - DB-seam: RLS deniega INSERT y oculta filas cuando la variable de Familia no está fijada.
  - Request-seam: dos Familias; una no ve ni modifica los datos de la otra.
  - Materialización: la identidad de Clerk se persiste en `families`/`members`.
- [ ] Migraciones cableadas al flujo dev (`pnpm db:migrate`); AGENTS.md + README actualizados.
- [ ] Verificación: `pnpm lint:backend` + `pnpm test:backend` en verde.

## Review

Hecho y verificado (9 tests backend en verde, lint + format + typecheck OK):

- **Alembic** introducido (async, URL desde `Settings.database_url`). Migración inicial `0001`: tablas `families`/`members`, `ENABLE`+`FORCE ROW LEVEL SECURITY`, política `family_isolation` por `current_setting('app.current_family_id', true)`, rol `tandem_app` NOSUPERUSER + grants + default privileges. Verificada `upgrade`/`downgrade`/`re-upgrade` contra una DB estilo dev (owner `tandem`).
- **Rol de aplicación** `tandem_app`: el runtime conecta como él (`Settings.app_database_url`) porque un superusuario/owner ignora RLS incluso con `FORCE`. Comprobado en vivo: insert sin variable de Familia → "violates row-level security policy"; con variable → OK.
- **Inyección centralizada**: `app/tenancy.py::family_session` abre transacción, fija `app.current_family_id`, materializa la identidad de Clerk en `families`/`members` y hace `yield` de la sesión. Único punto; ningún handler la fija ad hoc.
- **`GET /members`** acotado a la Familia (RLS) como costura de request.
- **Tests**: request-seam (dos Familias aisladas), materialización persiste, 403 sin Familia, y DB-seam (RLS deniega SELECT/INSERT sin variable y bloquea escritura cruzada).
- Migraciones cableadas a `pnpm dev` (`pnpm db:migrate`); AGENTS.md, README backend y **ADR-0005** actualizados.

### Mapeo a acceptance criteria

- Identidad de Clerk persistida en `families`/`members` → `tenancy._materialize` + test `test_materializes_clerk_identity`.
- Variable de `family_id` por transacción desde el contexto autenticado → `family_session` (`set_config(..., true)`).
- RLS activado; dos Familias aisladas en la costura de request → `test_members_isolated_between_families`.
- Test de sesión de DB: RLS deniega sin variable → `test_rls_denies_select/insert_when_family_var_unset`.
- Inyección de `family_id` centralizada → `family_session` (no repetida en handlers).

### Notas para issue 03 (Hijos)

- La tabla `children` aún no existe; al crearla en su migración debe añadir su **propia política RLS** (no se hereda) sobre `family_id`. Los grants DML los hereda vía `ALTER DEFAULT PRIVILEGES`.
