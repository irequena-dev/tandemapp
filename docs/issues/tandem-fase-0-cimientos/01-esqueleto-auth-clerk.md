## Parent

`docs/prd/tandem-fase-0-cimientos.md`

## What to build

El esqueleto andante de la plataforma: un monorepo con `frontend/` (React + Vite, shell PWA con routing, `ClerkProvider` y `QueryClientProvider`) y `backend/` (FastAPI + SQLModel conectado a PostgreSQL). Un endpoint REST autenticado con el JWT de Clerk devuelve la identidad del Miembro y su Familia derivadas del token, y la PWA, tras iniciar sesión, muestra esa identidad en pantalla.

Es el primer corte de extremo a extremo (login → API autenticada → contexto de Familia → UI) y establece la infraestructura de test que reutilizan las demás rebanadas: PostgreSQL real efímero, cliente ASGI en proceso para el backend, y MSW para el frontend.

Tipo: **HITL** — requiere crear el proyecto en Clerk, activar Organizations y aportar las claves/secretos de entorno.

## Acceptance criteria

- [ ] Existen `frontend/` y `backend/` arrancables en local con sus dependencias.
- [ ] El backend expone un endpoint autenticado (p. ej. "quién soy") que valida el JWT de Clerk y responde con el Miembro y la Familia del contexto.
- [ ] Una petición sin token válido al endpoint autenticado es rechazada.
- [ ] La PWA permite iniciar sesión con Clerk y muestra la identidad del Miembro y su Familia.
- [ ] Está montada la infra de test: PostgreSQL real efímero + cliente ASGI (backend) y MSW (frontend), con al menos un test pasando por cada costura.
- [ ] El shell de la PWA tiene routing y los providers (`ClerkProvider`, `QueryClientProvider`) configurados.

## Blocked by

- None - can start immediately
