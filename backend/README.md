# CaosCero — Backend

API REST (para la PWA) y, más adelante, servidor MCP. FastAPI + SQLModel + PostgreSQL, gestionado con **uv** (Python 3.12).

## Requisitos
- [uv](https://docs.astral.sh/uv/)
- Docker (para los tests con testcontainers y, en dev, para el Postgres local)

## Variables de entorno (`.env.local`, no versionado)
- `CLERK_SECRET_KEY` — se obtiene con `clerk env pull`.
- `DATABASE_URL` — cadena async, p. ej. `postgresql+asyncpg://caoscero:caoscero@localhost:5544/caoscero`.
- `FRONTEND_ORIGIN` — origen de la PWA (por defecto `http://localhost:5173`); se usa para CORS y como authorized party de Clerk.

## Postgres de desarrollo (Docker)
```bash
docker run -d --name caoscero-dev-db \
  -e POSTGRES_USER=caoscero -e POSTGRES_PASSWORD=caoscero -e POSTGRES_DB=caoscero \
  -p 5544:5432 postgres:17-alpine
```

## Arrancar
```bash
uv run uvicorn app.main:app --port 8000 --reload
```
- `GET /health` — comprueba la conexión a Postgres.
- `GET /whoami` — requiere `Authorization: Bearer <JWT de Clerk>`; devuelve el Miembro y la Familia (Organización) del contexto.

## Tests
Los tests levantan un Postgres efímero con testcontainers (requiere Docker):
```bash
uv run pytest
```
> Nota: si `DOCKER_HOST` apunta a un endpoint TCP inalcanzable, exporta el socket:
> `DOCKER_HOST=unix:///var/run/docker.sock uv run pytest`
