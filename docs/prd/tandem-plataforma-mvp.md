# Tándem — Plataforma MVP (Índice / Roadmap)

> Índice raíz del producto. El detalle de cada parte vive en su **PRD de fase**; aquí solo quedan la visión, el mapa de fases y las decisiones **transversales** comunes a todas.
>
> Vocabulario: glosario en `CONTEXT.md`. Decisiones de calado en `docs/adr/`: ADR-0001 (token MCP por Miembro), ADR-0002 (backend sin NLP), ADR-0003 (Eventos recurrentes materializados), ADR-0004 (frontend con CSS + tokens y Radix headless; sin Tailwind).

## Problem Statement

Como Miembro de una familia, la logística de la crianza genera una carga mental constante: qué falta comprar, qué talla calza ahora cada Hijo, cuándo le toca la siguiente dosis y quién se la dio, cuándo es la próxima cita o la excursión del cole y qué trámites hay pendientes. Todo ocurre con las manos ocupadas y entre varias personas, así que sin un sitio común nos pisamos y se nos olvidan cosas.

## Solution

Una plataforma por Familia con dos formas complementarias de uso: **entrada manos libres** dictando a la app de Claude (que escribe datos estructurados vía un servidor MCP remoto) y **consulta/validación visual** en una PWA móvil rápida. Todo aislado por Familia, compartido entre Miembros y actualizado al volver a la app.

## Mapa de fases

Cada fase es una rebanada vertical (DB → backend REST/MCP → PWA) construida sobre los cimientos de la Fase 0. Las Fases 1–4 **dependen de la Fase 0**; entre ellas son en gran medida independientes.

| Fase | PRD | Resumen |
|------|-----|---------|
| 0 | [Cimientos](./tandem-fase-0-cimientos.md) | Auth, multi-tenancy + RLS, Familia/Miembro, alta de Hijos, seguridad MCP, esqueleto PWA. Prerrequisito de todo. |
| 1 | [Lista de la compra](./tandem-fase-1-lista-compra.md) | Rebanada más sencilla; **tracer bullet** que fija el *prior art* de las costuras. |
| 2 | [Crecimiento y tallas](./tandem-fase-2-crecimiento-tallas.md) | Medidas y Tallas con histórico append-only. |
| 3 | [Salud](./tandem-fase-3-salud.md) | Visitas médicas, Pautas, Administraciones y cálculo de la siguiente toma. La de mayor valor manos-libres. |
| 4 | [Agenda](./tandem-fase-4-agenda.md) | Eventos, Tipos de Evento gestionados y Series recurrentes. |

**Orden recomendado**: Fase 0 → Fase 1 (fija patrones) → Fases 2/3/4 según prioridad (Salud aporta el mayor valor).

> **Artefacto transversal de UI**: la [IA y pantallas](./tandem-ia-pantallas.md) define la navegación (shell de 5 pestañas: Hoy, Compra, Eventos, Hijos, Pautas), la pantalla **Hoy** y el overlay **Ajustes**, que cruzan varias fases. Manda sobre la IA y el contenido de pantalla; cada PRD de fase rellena su parte.

## Decisiones transversales

Comunes a todas las fases; cada PRD de fase las da por supuestas.

### Arquitectura
- Monorepo: `frontend/` (React + Vite, PWA, TanStack Query) y `backend/` (FastAPI + FastMCP, SQLModel, PostgreSQL).
- Dos superficies sobre el mismo dominio/BD: **API REST** (PWA) y **servidor MCP remoto** (Claude).
- **ADR-0002**: el backend no interpreta lenguaje natural; Claude elige intención y extrae datos; el backend valida y persiste.

### Seguridad y multi-tenancy
- Familia ≡ Organización de Clerk (`family_id` ≡ `org_id`); Miembro ≡ usuario de Clerk y pertenece a exactamente una Familia. Toda tabla lleva `family_id`.
- **Defensa en profundidad**: filtrado en la capa de aplicación (siempre por `family_id`) + **RLS** en PostgreSQL con variable de sesión (`SET LOCAL`) por transacción.
- **REST** autenticado con JWT de Clerk. **MCP (ADR-0001)** con `Bearer` por Miembro, validado con `secrets.compare_digest()`, rate limiting por token. Acciones atribuidas al Miembro.

### Experiencia
- PWA instalable y responsive, service worker solo para assets (**no offline-first**).
- "Tiempo real" = **optimistic updates + refetch** (al enfocar / polling corto); sin WebSocket/push.
- Zona horaria del **dispositivo** para mostrar/agrupar; timestamps en UTC.
- **Correcciones**: todos los registros son editables/borrables desde la PWA (sin log de auditoría inmutable).
- Pantalla de inicio **Hoy** (héroe "Ahora" + timeline del día + "Más cosas") a la que cada fase aporta su parte (próxima toma, eventos de hoy, contador de compra, próxima cita). La talla actual se asoma en el card de Hijo. Detalle en [IA y pantallas](./tandem-ia-pantallas.md).
- Navegación: **shell de 5 pestañas** (Hoy, Compra, Eventos, Hijos, Pautas) + overlay **Ajustes**. **Una Familia por Miembro** ⇒ sin `OrganizationSwitcher` en la UI.

### Contrato MCP (visión global)
- Muchas herramientas tipadas y específicas por acción; escritura + **lecturas mínimas** para desambiguar.
- **Matching estricto de Hijo** por nombre con error estructurado (definido en Fase 0); el MCP nunca crea Hijos.
- Mutaciones por voz limitadas al **flujo clínico** (Administración, finalizar Pauta); tachar compra y marcar Eventos hechos son solo PWA.
- Alta de Hijos, Tipos de Evento y Series: solo PWA.

## Testing Decisions (transversal)

Costuras acordadas, reutilizadas por todas las fases (la Fase 1 fija el *prior art*):

1. **Backend — costura HTTP/REST**: cliente ASGI en proceso contra **Postgres real** efímero.
2. **Backend — costura de herramientas MCP**: invocar tools como Claude (con `Bearer`) contra el mismo Postgres real.
3. **Aislamiento (RLS)**: dos Familias en la costura de request + un test de sesión de DB que confirme que RLS deniega sin la variable de Familia.
4. **Frontend — costura de ruta/página**: render real + interacción (RTL) con la red mockeada en el límite HTTP (**MSW**), sin mockear TanStack Query por dentro.

Principio: probar **comportamiento externo**, no internals. Postgres real (no SQLite/mocks) por RLS y JSONB.

## Out of Scope (global)

- Notificaciones push y email (agenda y salud son de consulta/pull en v1).
- Offline-first y cola de mutaciones.
- Multi-familia por Miembro.
- Curvas de percentil OMS (y el sexo del Hijo).
- Idempotencia global por clave (se usa guarda de dominio en Administración).

## Further Notes

- Riesgo principal: la calidad de los esquemas de las herramientas MCP determina la fiabilidad de la extracción (ADR-0002).
- Dependencias externas: Clerk (auth + Organizations), PostgreSQL (RLS + JSONB), proxy inverso (rate limiting MCP).
- Las decisiones de detalle que no llegaron a ADR (Hijo de primera clase, una Familia por Miembro, tipos fijos de Medida/Talla, lista única de compra, guarda de duplicado en Administración) quedan registradas en `CONTEXT.md` y en los PRDs de fase; si alguna se vuelve costosa de revertir, conviene promoverla a ADR.
- Siguiente paso sugerido: `to-issues` sobre cada PRD de fase, empezando por la Fase 0.
