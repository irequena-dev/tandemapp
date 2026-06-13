# Aislamiento por RLS con rol de aplicación dedicado y `SET LOCAL`

El aislamiento entre Familias (tenants) es **defensa en profundidad**: la capa de aplicación inyecta siempre `family_id`, y PostgreSQL aplica **Row Level Security** como red de seguridad. La Familia activa se fija **por transacción** con la variable de sesión `app.current_family_id` (vía `set_config(..., true)`, equivalente a `SET LOCAL`), y las políticas RLS comparan `family_id` contra ella. Toda transacción de dominio pasa por una **única puerta** (`tenancy.family_session`), que además materializa la identidad de Clerk en `families`/`members`; ningún handler fija la variable ad hoc.

El runtime conecta con un rol **`tandem_app` NOSUPERUSER** (no owner), distinto del rol owner/admin con el que corren las migraciones. El esquema, las políticas (`ENABLE` + `FORCE ROW LEVEL SECURITY`) y el propio rol los crea **Alembic** (migraciones async, URL inyectada desde la config del backend).

## Considered Options

- **Solo filtrado en la capa de aplicación**: simple, pero un único `WHERE` olvidado filtra datos de otra Familia; no hay red de seguridad.
- **RLS conectando como owner/superusuario**: tentador por reusar la conexión existente, pero **un superusuario o el owner de la tabla se saltan RLS incluso con `FORCE`**: la red de seguridad no existiría de verdad.
- **RLS + rol de aplicación NOSUPERUSER (elegido)**: el runtime no puede saltarse las políticas; RLS deniega de verdad cuando la variable de Familia no está fijada. Las migraciones siguen corriendo como owner.

## Consequences

- Hay **dos conexiones**: `DATABASE_URL` (owner, migraciones) y la derivada runtime (`tandem_app`, `APP_DB_PASSWORD`). El runtime usa `Settings.app_database_url`.
- Las políticas usan `current_setting('app.current_family_id', true)`: si no está fijada, devuelve `NULL` y RLS oculta filas y rechaza escrituras (`WITH CHECK`).
- `family_session` es el punto de inyección centralizado y el sitio donde se materializa la identidad de Clerk; el riesgo señalado en el PRD (fijar bien la variable en cada transacción) queda en un solo lugar y bien testeado.
- Las tablas futuras heredan los grants vía `ALTER DEFAULT PRIVILEGES`, pero **deben añadir su propia política RLS** en su migración (RLS no se hereda).
- Se introduce Alembic como herramienta de migraciones del proyecto; el esquema deja de poder crearse ad hoc.
- Cambiar de modelo (p. ej. un Miembro en varias Familias) obligaría a revisar la política y la variable de sesión.
