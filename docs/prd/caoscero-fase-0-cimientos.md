# Fase 0 — Cimientos

> Parte del roadmap de [CaosCero](./caoscero-plataforma-mvp.md). Prerrequisito de las Fases 1–4.
> Vocabulario: glosario de `CONTEXT.md`. Decisiones de calado: ADR-0001 (token MCP por Miembro), ADR-0002 (backend sin NLP).

## Problem Statement

Como Miembro de una familia no puedo empezar a usar nada hasta que exista una base de confianza: necesito entrar con mi cuenta, tener la certeza de que los datos de mi Familia son privados y que nadie de fuera los ve, dar de alta a mis Hijos, y conectar mi app de Claude para poder dictar. Sin estos cimientos, ninguna funcionalidad (compra, salud, agenda) tiene dónde apoyarse.

## Solution

Una base de plataforma que ofrece: registro e inicio de sesión, una Familia por cada hogar con aislamiento estricto de datos, gestión de Hijos desde la PWA, y conexión segura de Claude mediante un token MCP propio de cada Miembro. Incluye el esqueleto de la PWA instalable y el esqueleto del backend con sus dos superficies (REST para la PWA, MCP para Claude).

## User Stories

1. Como Miembro, quiero registrarme e iniciar sesión, para acceder a los datos de mi Familia.
2. Como Miembro, quiero pertenecer a una Familia, para que todo lo que veo y escribo quede dentro de ella.
3. Como Miembro, quiero que ningún dato de otra Familia me sea jamás visible ni modificable, para confiar en la privacidad de mi hogar.
4. Como Miembro, quiero invitar a otra persona (mi pareja, una abuela) a mi Familia, para compartir la gestión.
5. Como Miembro, quiero dar de alta a mis Hijos con su nombre y fecha de nacimiento, para poder asociarles datos en fases posteriores.
6. Como Miembro, quiero editar o eliminar un Hijo desde la PWA, para corregir un nombre o una fecha equivocada.
7. Como Miembro, quiero ver la edad de un Hijo derivada de su fecha de nacimiento, para tener contexto rápido.
8. Como Miembro, quiero generar mi propio token MCP, para conectar mi app de Claude a CaosCero.
9. Como Miembro, quiero revocar mi token MCP, para cortar el acceso si pierdo el dispositivo.
10. Como Miembro, quiero que mis acciones queden atribuidas a mí, tanto en la PWA como por voz, para saber quién hizo qué.
11. Como Miembro, quiero instalar CaosCero como app en el móvil, para abrirla rápido desde la pantalla de inicio.
12. Como Miembro, quiero que un nombre de Hijo mal entendido al dictar no cree un Hijo fantasma, sino que Claude me pida aclaración, para mantener los datos limpios.
13. Como Miembro, quiero un dashboard de inicio (inicialmente vacío) donde las fases siguientes irán colocando sus resúmenes, para tener un punto de entrada único.

## Implementation Decisions

### Arquitectura
- Monorepo con `frontend/` (React + Vite, PWA, TanStack Query) y `backend/` (FastAPI + FastMCP, SQLModel, PostgreSQL).
- El backend expone **dos superficies** sobre el mismo dominio y BD: **API REST** (PWA) y **servidor MCP remoto** (Claude). Esta fase monta ambos esqueletos.
- ADR-0002: el backend no interpreta lenguaje natural; valida (Pydantic/SQLModel) y persiste.

### Autenticación y multi-tenancy
- Familia ≡ Organización de Clerk; `family_id` ≡ `org_id`. Miembro ≡ usuario de Clerk, pertenece a exactamente una Familia.
- **REST**: autenticado con JWT de Clerk; del token se derivan Miembro y Familia.
- **MCP (ADR-0001)**: `Authorization: Bearer <token>` por Miembro; token de alta entropía (≥32 bytes) validado con `secrets.compare_digest()`; resuelve a Miembro → Familia. Rate limiting estricto por token en el proxy inverso.
- **Aislamiento en defensa en profundidad**: (a) capa de aplicación que inyecta SIEMPRE `family_id`, y (b) **RLS** en PostgreSQL como red de seguridad, con variable de sesión (`SET LOCAL`) fijada por transacción desde el contexto autenticado.

### Esquema (cimientos)
- `families` (espejo de la org de Clerk).
- `members` (espejo del usuario de Clerk; `family_id`). Es el nombre técnico del Miembro.
- `children`: `id`, `family_id`, `name`, `birth_date`.
- `mcp_tokens`: `id`, `member_id`, hash del token, metadatos de revocación.
- Todas las tablas (estas y las de fases siguientes) llevan `family_id` y políticas RLS.

### Contratos
- **REST**: CRUD de Hijos; gestión de miembros/invitaciones (vía Clerk); generación/revocación de token MCP. Todo acotado a la Familia autenticada.
- **MCP**: `list_children()` (lectura mínima) y el **contrato de matching estricto** de Hijo: las herramientas de fases siguientes que reciban `child_name` resolverán por nombre exacto (case-insensitive); si no hay match o es ambiguo, devuelven un **error estructurado con la lista de Hijos válidos**. La regla de matching se define aquí porque el Hijo es foundational.
- Alta/edición/baja de Hijos: **solo PWA**; el MCP nunca crea Hijos.

### Frontend (esqueleto)
- PWA instalable y responsive: `manifest.json`, service worker solo para caché de assets (no offline-first).
- `ClerkProvider` + `QueryClientProvider`; routing y layout base; pantalla de Ajustes (Hijos, token MCP, miembros).
- Configuración base de TanStack Query (optimistic updates + refetch al enfocar) reutilizable por las fases.
- Zona horaria del dispositivo para fechas/horas; timestamps en UTC en backend.
- Dashboard de inicio como contenedor vacío al que cada fase añade su widget.

## Testing Decisions

- Buenos tests: comportamiento externo observable, no internals. Postgres real (no SQLite/mocks) por RLS y JSONB.
- **Costura HTTP/REST**: cliente ASGI en proceso contra Postgres real; cubre CRUD de Hijos y gestión de token.
- **Costura MCP**: invocar `list_children` con `Authorization: Bearer`; verificar rechazo por token inválido/revocado y el **error estructurado de matching** cuando un `child_name` no existe.
- **Aislamiento (RLS)**: crear dos Familias y verificar que una nunca ve ni modifica datos de la otra (Hijos); más un test de **sesión de DB** que confirme que RLS deniega cuando la variable de Familia no está fijada.
- Esta fase **no** establece aún el prior art completo de frontend de dominio; sí el de auth/aislamiento. La Fase 1 fija el prior art de las costuras de dominio.

## Out of Scope

- Toda funcionalidad de dominio: compra (Fase 1), crecimiento/tallas (Fase 2), salud (Fase 3), agenda (Fase 4).
- Offline-first y notificaciones push.
- Multi-familia por Miembro (un Miembro pertenece a exactamente una Familia).

## Further Notes

- Esta fase fija los patrones que reutilizan todas las demás: estructura REST, montaje del servidor MCP, autenticación de ambas superficies, RLS por `SET LOCAL`, y base de optimistic updates.
- Dependencias externas: Clerk (auth + Organizations), PostgreSQL (RLS + JSONB), proxy inverso (rate limiting MCP).
- Riesgo: fijar correctamente la variable de Familia en cada transacción es la pieza de la que depende todo el aislamiento; debe quedar centralizada y bien testeada aquí.
