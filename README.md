# Tándem

Plataforma para repartir la carga mental logística de la crianza y el hogar entre los Miembros de una Familia. Entrada manos libres por voz (vía Claude/MCP) y consulta/validación visual en una PWA.

Ver el glosario de dominio en [`CONTEXT.md`](./CONTEXT.md), las decisiones en [`docs/adr/`](./docs/adr/) y el roadmap en [`docs/prd/tandem-plataforma-mvp.md`](./docs/prd/tandem-plataforma-mvp.md).

## Estructura
- `frontend/` — React + Vite (TypeScript), PWA, TanStack Query, Clerk.
- `backend/` — FastAPI + uv (Python 3.12), SQLModel, PostgreSQL; API REST y (más adelante) servidor MCP.

## Requisitos
- [pnpm](https://pnpm.io/), [uv](https://docs.astral.sh/uv/) y Docker.
- Variables de entorno en `frontend/.env.local` y `backend/.env.local` (claves de Clerk vía `clerk env pull`; ver `backend/README.md`).

## Arrancar todo en local
Desde la raíz:

```bash
pnpm install          # primera vez (deps del orquestador)
pnpm -C frontend install
pnpm dev
```

`pnpm dev` levanta, en este orden:
1. El Postgres de desarrollo en Docker (`tandem-dev-db`, puerto 5544).
2. El frontend (Vite) en http://localhost:5173
3. El backend (FastAPI) en http://localhost:8000

## Tests
```bash
pnpm test:backend     # pytest con Postgres efímero (testcontainers)
```
