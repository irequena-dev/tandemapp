# Tándem — Backend

API REST (para la PWA) y, más adelante, servidor MCP. FastAPI + SQLModel + PostgreSQL, gestionado con **uv** (Python 3.12).

## Requisitos
- [uv](https://docs.astral.sh/uv/)
- Docker (para los tests con testcontainers y, en dev, para el Postgres local)

## Variables de entorno (`.env.local`, no versionado)
- `CLERK_SECRET_KEY` — se obtiene con `clerk env pull`.
- `DATABASE_URL` — cadena async, p. ej. `postgresql+asyncpg://tandem:tandem@localhost:5544/tandem`. Es la conexión **owner/admin**: la usan las migraciones de Alembic.
- `FRONTEND_ORIGIN` — origen de la PWA (por defecto `http://localhost:5173`); se usa para CORS y como authorized party de Clerk.
- `APP_DB_PASSWORD` — clave del rol de aplicación `tandem_app` (por defecto `tandem_app`). El runtime conecta como `tandem_app` (NOSUPERUSER) para que RLS aplique de verdad; un superusuario/owner se la saltaría aunque esté `FORCE`.

## Postgres de desarrollo (Docker)
```bash
docker run -d --name tandem-dev-db \
  -e POSTGRES_USER=tandem -e POSTGRES_PASSWORD=tandem -e POSTGRES_DB=tandem \
  -p 5544:5432 postgres:17-alpine
```

## Arrancar
```bash
uv run uvicorn app.main:app --port 8000 --reload
```
- `GET /health` — comprueba la conexión a Postgres.
- `GET /whoami` — requiere `Authorization: Bearer <JWT de Clerk>`; devuelve el Miembro y la Familia (Organización) del contexto.
- `GET /members` — acotado a la Familia autenticada (RLS); lista sus Miembros.

## Migraciones (Alembic)
El esquema, las políticas RLS y el rol `tandem_app` los crea la migración inicial. Aplícala con la `DATABASE_URL` owner (Alembic toma la URL de la config del backend):
```bash
uv run alembic upgrade head     # o, desde la raíz: pnpm db:migrate
```

## Tests
Los tests levantan un Postgres efímero con testcontainers (requiere Docker):
```bash
uv run pytest
```
> Nota: si `DOCKER_HOST` apunta a un endpoint TCP inalcanzable, exporta el socket:
> `DOCKER_HOST=unix:///var/run/docker.sock uv run pytest`
