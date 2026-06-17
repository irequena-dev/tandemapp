# Tándem — Contrato de API REST

> Contrato normativo para la API REST que consume la PWA. Derivado de las pantallas implementadas (`tandem-ia-pantallas.md`), los mock types del frontend (`lib/mock-data.ts`) y los PRDs de fase. Cada endpoint está acotado a la Familia del JWT autenticado (Clerk); `family_id` lo inyecta el servidor, nunca el cliente.
>
> El servidor MCP (Claude) tiene su propio subconjunto documentado en cada PRD de fase; este doc cubre **solo REST**.
>
> Vocabulario: `CONTEXT.md`. Decisiones: `docs/adr/`. Esquema visual: `DESIGN.md`.

---

## Convenciones

| Aspecto | Decisión |
|---------|----------|
| Base URL | `/api` |
| Auth | JWT de Clerk en header `Authorization: Bearer <jwt>`. El backend extrae `user_id` → Miembro y `org_id` → Familia. |
| Content-Type | `application/json` |
| IDs | UUID v4 (`uuid`) para entidades de dominio; `string` (Clerk IDs) para `Family`, `Member`. |
| Timestamps | ISO 8601 con timezone (`datetime`), almacenados en UTC. |
| Dates | ISO 8601 date (`YYYY-MM-DD`). |
| Times | `HH:MM` (24h, sin segundos); nullable = día completo. |
| Paginación | No en v1 (listas acotadas por Familia). |
| Errores | `{ "detail": string }` con HTTP status apropiado. Matching de Hijo: `{ "detail": string, "code": "child_not_found" \| "child_ambiguous", "valid_children": [...] }`. |
| Soft-delete | No. Delete = hard delete (corregible por el usuario). |
| `family_id` | Inyectado por el servidor en toda escritura; filtrado por RLS en toda lectura. **Nunca en el body del cliente.** |
| Orden por defecto | Más reciente primero, salvo donde se indique. |

---

## 1. Identidad — Familia, Miembros, Hijos (Fase 0)

### 1.1 WhoAmI

Endpoint de bootstrap: resuelve el JWT a la identidad completa del Miembro.

```
GET /api/whoami
→ 200 WhoAmI
```

```ts
type WhoAmI = {
  member: MemberOut
  family: FamilyOut
}

type FamilyOut = {
  id: string              // org_id de Clerk
  name: string
}

type MemberOut = {
  id: string              // user_id de Clerk
  family_id: string
  display_name: string | null
}
```

### 1.2 Miembros

Lectura del roster. La gestión (invitar/eliminar) va por Clerk Organizations API.

```
GET /api/members
→ 200 MemberOut[]
```

### 1.3 Hijos

CRUD completo. `avatar_color` es un índice (0–5) de la paleta del sistema de diseño.

```
GET    /api/children                → 200 ChildOut[]
POST   /api/children                → 201 ChildOut
GET    /api/children/{child_id}     → 200 ChildOut
PATCH  /api/children/{child_id}     → 200 ChildOut
DELETE /api/children/{child_id}     → 204
```

```ts
type ChildOut = {
  id: string              // uuid
  family_id: string
  name: string
  birth_date: string      // YYYY-MM-DD
  avatar_color: number | null  // 0–5; null → fallback determinista
}

type ChildCreate = {
  name: string
  birth_date: string      // YYYY-MM-DD
  avatar_color?: number   // 0–5
}

type ChildUpdate = {
  name?: string
  birth_date?: string
  avatar_color?: number
}
```

> **Nota**: `height_cm`, `weight_kg`, `talla`, `talla_calzado` NO son campos del Hijo. Son **valores derivados** de la última Medida/Talla (§2). El frontend los obtiene por separado o el backend los incluye como campos calculados en `ChildOut` (ver §1.3.1).

#### 1.3.1 Hijo con resumen de métricas actuales (vista de lista)

Para la pantalla Hijos (cards con métricas), el backend devuelve el Hijo enriquecido con los valores actuales.

```
GET /api/children?include=current_metrics
→ 200 ChildWithMetricsOut[]
```

```ts
type ChildWithMetricsOut = ChildOut & {
  current_height_cm: number | null     // último measurement type=height
  current_weight_kg: number | null     // último measurement type=weight
  current_talla: string | null         // último size type=clothing
  current_talla_calzado: string | null // último size type=footwear
}
```

### 1.4 Token MCP

```
GET    /api/mcp-tokens              → 200 McpTokenOut[]
POST   /api/mcp-tokens              → 201 McpTokenCreated
DELETE /api/mcp-tokens/{token_id}   → 204  (revoca)
```

```ts
type McpTokenOut = {
  id: string            // uuid
  created_at: string    // datetime ISO
  revoked_at: string | null
}

type McpTokenCreated = {
  id: string
  token: string         // valor en claro, una sola vez
  created_at: string
}
```

---

## 2. Crecimiento y Tallas (Fase 2)

### 2.1 Medidas (Measurements)

Registro numérico append-only de altura y peso por Hijo.

```
GET    /api/children/{child_id}/measurements                  → 200 MeasurementOut[]
GET    /api/children/{child_id}/measurements?type=height      → 200 MeasurementOut[]
GET    /api/children/{child_id}/measurements/current           → 200 CurrentMeasurementsOut
POST   /api/children/{child_id}/measurements                  → 201 MeasurementOut
PATCH  /api/children/{child_id}/measurements/{measurement_id} → 200 MeasurementOut
DELETE /api/children/{child_id}/measurements/{measurement_id} → 204
```

```ts
type MeasurementOut = {
  id: string              // uuid
  child_id: string
  type: "height" | "weight"
  value: number           // cm para height, kg para weight
  unit: string            // "cm" | "kg"
  measured_at: string     // YYYY-MM-DD
  recorded_by: string     // member_id
  created_at: string
}

type MeasurementCreate = {
  type: "height" | "weight"
  value: number
  unit: string            // "cm" | "kg"
  measured_at: string     // YYYY-MM-DD
}

type MeasurementUpdate = {
  value?: number
  unit?: string
  measured_at?: string
}

// Resumen: el valor más reciente por tipo
type CurrentMeasurementsOut = {
  height: MeasurementOut | null
  weight: MeasurementOut | null
}
```

### 2.2 Tallas (Sizes)

Registro de etiquetas de talla append-only (ropa, calzado) por Hijo.

```
GET    /api/children/{child_id}/sizes                → 200 SizeOut[]
GET    /api/children/{child_id}/sizes?type=clothing  → 200 SizeOut[]
GET    /api/children/{child_id}/sizes/current         → 200 CurrentSizesOut
POST   /api/children/{child_id}/sizes                → 201 SizeOut
PATCH  /api/children/{child_id}/sizes/{size_id}      → 200 SizeOut
DELETE /api/children/{child_id}/sizes/{size_id}      → 204
```

```ts
type SizeOut = {
  id: string
  child_id: string
  type: "clothing" | "footwear"
  label: string           // texto libre: "5-6 años", "29", "24-36 meses"
  recorded_at: string     // YYYY-MM-DD
  recorded_by: string     // member_id
  created_at: string
}

type SizeCreate = {
  type: "clothing" | "footwear"
  label: string
  recorded_at: string     // YYYY-MM-DD
}

type SizeUpdate = {
  label?: string
  recorded_at?: string
}

type CurrentSizesOut = {
  clothing: SizeOut | null
  footwear: SizeOut | null
}
```

---

## 3. Lista de la compra (Fase 1)

### 3.1 Ítems de compra

Lista única por Familia. Sin sub-listas.

```
GET    /api/shopping-items                          → 200 ShoppingItemOut[]
POST   /api/shopping-items                          → 201 ShoppingItemOut
PATCH  /api/shopping-items/{item_id}                → 200 ShoppingItemOut
DELETE /api/shopping-items/{item_id}                → 204
POST   /api/shopping-items/{item_id}/buy            → 200 ShoppingItemOut
POST   /api/shopping-items/{item_id}/undo           → 200 ShoppingItemOut
DELETE /api/shopping-items/bought                   → 204  (limpiar comprados)
```

```ts
type ShoppingItemOut = {
  id: string              // uuid
  family_id: string
  text: string            // texto libre; destinatario va dentro ("para Mateo")
  status: "pending" | "bought"
  created_by: string      // member_id
  bought_by: string | null    // member_id de quien lo compró
  bought_at: string | null    // datetime ISO
  created_at: string
  updated_at: string
}

type ShoppingItemCreate = {
  text: string
}

type ShoppingItemUpdate = {
  text: string
}
```

> **Acciones**: `buy` fija `status=bought`, `bought_by` y `bought_at`; `undo` revierte a `pending` y limpia `bought_by`/`bought_at`. El listado devuelve todos (pending + bought); el frontend agrupa.

---

## 4. Agenda — Eventos, Tipos, Series (Fase 4)

### 4.1 Eventos

```
GET    /api/events                          → 200 EventOut[]
GET    /api/events?type_id=X&child_id=Y    → 200 EventOut[]   (filtros)
POST   /api/events                          → 201 EventOut
GET    /api/events/{event_id}               → 200 EventOut
PATCH  /api/events/{event_id}               → 200 EventOut
DELETE /api/events/{event_id}               → 204
POST   /api/events/{event_id}/done          → 200 EventOut
POST   /api/events/{event_id}/undo          → 200 EventOut
```

```ts
type EventOut = {
  id: string              // uuid
  family_id: string
  title: string
  date: string            // YYYY-MM-DD
  time: string | null     // HH:MM; null = día completo
  event_type_id: string   // uuid
  event_type: EventTypeOut  // expandido inline
  child_id: string | null // uuid del Hijo, nullable
  child: ChildOut | null  // expandido inline si existe
  status: "pending" | "done"
  is_overdue: boolean     // calculado: status=pending && date < hoy
  series_id: string | null
  created_by: string
  created_at: string
}

type EventCreate = {
  title: string
  date: string
  time?: string | null
  event_type_id: string
  child_id?: string | null
}

type EventUpdate = {
  title?: string
  date?: string
  time?: string | null
  event_type_id?: string
  child_id?: string | null
}
```

> **`is_overdue`** es calculado por el backend (no se persiste). El frontend muestra 3 estados visuales: `done` → "Hecho" (verde), `pending` + `is_overdue` → "Atrasado" (rojo), `pending` + no overdue → "Pendiente".

### 4.2 Tipos de Evento

```
GET    /api/event-types                     → 200 EventTypeOut[]
POST   /api/event-types                     → 201 EventTypeOut
PATCH  /api/event-types/{type_id}           → 200 EventTypeOut
DELETE /api/event-types/{type_id}           → 204
```

```ts
type EventTypeOut = {
  id: string              // uuid
  family_id: string | null  // null = tipo base del sistema
  name: string
  icon: string            // clave de icono del sistema de diseño
  is_system: boolean      // true si es base sembrado; no se puede borrar
}

type EventTypeCreate = {
  name: string
  icon?: string           // por defecto "circle"
}

type EventTypeUpdate = {
  name?: string
  icon?: string
}
```

> **Tipos base** (sembrados al crear la Familia): Médico, Cole, Extraescolar, Trámite, Otros. `family_id=null` → son compartidos; no borrar ni editar.

### 4.3 Series

```
POST   /api/series                          → 201 SeriesCreatedOut
DELETE /api/series/{series_id}/future        → 204  (borra ocurrencias futuras)
```

```ts
type SeriesCreate = {
  title: string
  event_type_id: string
  child_id?: string | null
  time?: string | null
  cadence: "weekly" | "biweekly" | "monthly"
  day_of_week?: number    // 0=lun…6=dom; requerido si weekly/biweekly
  starts_at: string       // YYYY-MM-DD
  ends_at?: string        // YYYY-MM-DD (obligatorio uno de ends_at o max_count)
  max_count?: number
}

type SeriesCreatedOut = {
  id: string
  events_created: number  // cuántas ocurrencias se materializaron
}
```

---

## 5. Salud — Visitas médicas, Pautas, Administraciones (Fase 3)

### 5.1 Visitas médicas

Registro histórico por Hijo. JSONB para notas/tratamiento.

```
GET    /api/children/{child_id}/health-visits                   → 200 HealthVisitOut[]
POST   /api/children/{child_id}/health-visits                   → 201 HealthVisitOut
GET    /api/children/{child_id}/health-visits/{visit_id}        → 200 HealthVisitOut
PATCH  /api/children/{child_id}/health-visits/{visit_id}        → 200 HealthVisitOut
DELETE /api/children/{child_id}/health-visits/{visit_id}        → 204
```

```ts
type HealthVisitOut = {
  id: string              // uuid
  child_id: string
  family_id: string
  visited_at: string      // YYYY-MM-DD
  diagnosis: string
  notes: string | null    // notas libres / tratamiento
  pauta_ids: string[]     // IDs de Pautas que originó esta visita
  created_by: string
  created_at: string
}

type HealthVisitCreate = {
  visited_at: string      // YYYY-MM-DD
  diagnosis: string
  notes?: string
}

type HealthVisitUpdate = {
  visited_at?: string
  diagnosis?: string
  notes?: string
}
```

### 5.2 Pautas

Cross-Hijo: se listan por Familia (no anidadas bajo child).

```
GET    /api/pautas                          → 200 PautaOut[]
GET    /api/pautas?status=active            → 200 PautaOut[]
GET    /api/pautas?child_id=X              → 200 PautaOut[]
POST   /api/pautas                          → 201 PautaOut
GET    /api/pautas/{pauta_id}               → 200 PautaOut
PATCH  /api/pautas/{pauta_id}               → 200 PautaOut
POST   /api/pautas/{pauta_id}/finish        → 200 PautaOut
DELETE /api/pautas/{pauta_id}               → 204
```

```ts
type PautaOut = {
  id: string              // uuid
  family_id: string
  child_id: string
  child: ChildOut         // expandido inline (nombre, avatar)
  medication: string
  dose: string            // texto libre: "5 ml", "1 gota"
  interval_hours: number  // horas entre tomas
  duration_days: number
  started_at: string      // datetime ISO
  ends_at: string         // datetime ISO (calculado: started_at + duration_days)
  status: "active" | "finished"
  health_visit_id: string | null
  created_by: string
  created_at: string
  // Campos calculados
  day_number: number      // día actual del tratamiento (1-based)
  next_dose_at: string | null  // datetime ISO; null si finalizada
  todays_administrations: AdministrationOut[]
}

type PautaCreate = {
  child_id: string
  medication: string
  dose: string
  interval_hours: number
  duration_days: number
  health_visit_id?: string | null
}

type PautaUpdate = {
  medication?: string
  dose?: string
  interval_hours?: number
  duration_days?: number
}
```

> **`ends_at`** se calcula como `started_at + duration_days`. **`day_number`** es `floor((now - started_at) / 24h) + 1`. **`next_dose_at`** es la última Administración + `interval_hours`; null si `status=finished`.
>
> **Finalización automática**: si `now >= ends_at`, el backend marca `status=finished` al consultar (lazy).

### 5.3 Administraciones

Anidadas bajo Pauta.

```
GET    /api/pautas/{pauta_id}/administrations                         → 200 AdministrationOut[]
POST   /api/pautas/{pauta_id}/administrations                         → 201 AdministrationOut
PATCH  /api/pautas/{pauta_id}/administrations/{admin_id}              → 200 AdministrationOut
DELETE /api/pautas/{pauta_id}/administrations/{admin_id}              → 204
```

```ts
type AdministrationOut = {
  id: string              // uuid
  pauta_id: string
  administered_at: string // datetime ISO
  administered_by: string // member_id
  member_name: string     // display_name del Miembro (para mostrar "Dada por Ana")
  created_at: string
}

type AdministrationCreate = {
  administered_at?: string  // datetime ISO; por defecto = now()
}
```

> **Guarda de duplicado**: si hay otra Administración de la misma Pauta dentro de una ventana corta (configurable, ~15 min), se ignora la nueva y se devuelve la existente con `200` (no `201`).

---

## 6. Hoy — Pantalla de inicio (transversal)

Endpoint agregado que alimenta la pantalla Hoy. Combina datos de todas las fases.

```
GET /api/today
→ 200 TodayOut
```

```ts
type TodayOut = {
  // Héroe "Ahora": la cosa más urgente
  hero: HeroItem | null   // null → estado calmado

  // Timeline del día (cronológico)
  timeline: TimelineEntry[]

  // Tarjetas de resumen ("Más cosas")
  summary: {
    shopping_pending_count: number
    pautas_active_count: number
    pautas_finished_count: number
    next_medical_event: EventOut | null  // próximo Evento de tipo Médico
    children_status: "up_to_date"        // v1: siempre "Al día"
  }
}

type HeroItem = {
  type: "pauta_dose" | "event"
  title: string           // e.g. "Amoxicilina · 5 ml"
  subtitle: string        // e.g. "Mateo · Día 4 de 7"
  action_label: string    // e.g. "Marcar toma" | "Marcar hecho"
  // ID para la acción
  pauta_id?: string
  event_id?: string
}

type TimelineEntry = {
  type: "dose_given" | "dose_upcoming" | "event"
  time: string            // HH:MM
  title: string
  subtitle: string | null
  status: "done" | "upcoming" | "pending"
  // IDs para interacción
  pauta_id?: string
  administration_id?: string
  event_id?: string
}
```

---

## Esquema de base de datos (consolidado)

Derivado del contrato de API y los PRDs de fase. Todas las tablas llevan `family_id` y RLS.

```sql
-- Fase 0: Cimientos
families (
  id          TEXT PRIMARY KEY,          -- org_id de Clerk
  slug        TEXT,
  name        TEXT
);

members (
  id          TEXT PRIMARY KEY,          -- user_id de Clerk
  family_id   TEXT NOT NULL REFERENCES families(id),
  display_name TEXT
);

children (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    TEXT NOT NULL REFERENCES families(id),
  name         TEXT NOT NULL,
  birth_date   DATE NOT NULL,
  avatar_color SMALLINT                  -- 0–5; nullable, fallback determinista
);

mcp_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   TEXT NOT NULL REFERENCES members(id),
  family_id   TEXT NOT NULL REFERENCES families(id),
  token_hash  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);

-- Fase 1: Lista de la compra
shopping_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   TEXT NOT NULL REFERENCES families(id),
  text        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'  CHECK (status IN ('pending','bought')),
  created_by  TEXT NOT NULL REFERENCES members(id),
  bought_by   TEXT REFERENCES members(id),
  bought_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fase 2: Crecimiento y tallas
measurements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    TEXT NOT NULL REFERENCES families(id),
  child_id     UUID NOT NULL REFERENCES children(id),
  type         TEXT NOT NULL CHECK (type IN ('height','weight')),
  value        NUMERIC NOT NULL,
  unit         TEXT NOT NULL,           -- 'cm' | 'kg'
  measured_at  DATE NOT NULL,
  recorded_by  TEXT NOT NULL REFERENCES members(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

sizes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    TEXT NOT NULL REFERENCES families(id),
  child_id     UUID NOT NULL REFERENCES children(id),
  type         TEXT NOT NULL CHECK (type IN ('clothing','footwear')),
  label        TEXT NOT NULL,           -- "5-6 años", "29", "24-36 meses"
  recorded_at  DATE NOT NULL,
  recorded_by  TEXT NOT NULL REFERENCES members(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fase 3: Salud
health_visits (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    TEXT NOT NULL REFERENCES families(id),
  child_id     UUID NOT NULL REFERENCES children(id),
  visited_at   DATE NOT NULL,
  diagnosis    TEXT NOT NULL,
  notes        JSONB,                   -- notas libres / tratamiento
  created_by   TEXT NOT NULL REFERENCES members(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

pautas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id       TEXT NOT NULL REFERENCES families(id),
  child_id        UUID NOT NULL REFERENCES children(id),
  medication      TEXT NOT NULL,
  dose            TEXT NOT NULL,
  interval_hours  SMALLINT NOT NULL,    -- horas entre tomas
  duration_days   SMALLINT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished')),
  health_visit_id UUID REFERENCES health_visits(id),
  created_by      TEXT NOT NULL REFERENCES members(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

administrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id        TEXT NOT NULL REFERENCES families(id),
  pauta_id         UUID NOT NULL REFERENCES pautas(id),
  administered_at  TIMESTAMPTZ NOT NULL,
  administered_by  TEXT NOT NULL REFERENCES members(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fase 4: Agenda
event_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   TEXT REFERENCES families(id), -- NULL = tipo base del sistema
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'circle'
);

events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id     TEXT NOT NULL REFERENCES families(id),
  title         TEXT NOT NULL,
  date          DATE NOT NULL,
  time          TIME,                   -- nullable = día completo
  event_type_id UUID NOT NULL REFERENCES event_types(id),
  child_id      UUID REFERENCES children(id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  series_id     UUID REFERENCES series(id),
  created_by    TEXT NOT NULL REFERENCES members(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

series (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   TEXT NOT NULL REFERENCES families(id),
  cadence     TEXT NOT NULL CHECK (cadence IN ('weekly','biweekly','monthly')),
  day_of_week SMALLINT,                -- 0=lun…6=dom
  starts_at   DATE NOT NULL,
  ends_at     DATE,
  max_count   SMALLINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Índices recomendados

```sql
-- Lookup por familia (RLS ya filtra, pero para performance)
CREATE INDEX idx_shopping_items_family ON shopping_items(family_id);
CREATE INDEX idx_measurements_child ON measurements(child_id, type, measured_at DESC);
CREATE INDEX idx_sizes_child ON sizes(child_id, type, recorded_at DESC);
CREATE INDEX idx_events_family_date ON events(family_id, date);
CREATE INDEX idx_events_type ON events(event_type_id);
CREATE INDEX idx_events_child ON events(child_id);
CREATE INDEX idx_pautas_family_status ON pautas(family_id, status);
CREATE INDEX idx_pautas_child ON pautas(child_id);
CREATE INDEX idx_administrations_pauta ON administrations(pauta_id, administered_at DESC);
CREATE INDEX idx_health_visits_child ON health_visits(child_id, visited_at DESC);
```

### RLS (patrón por tabla)

Todas las tablas de dominio siguen el mismo patrón de la Fase 0:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <table> FORCE ROW LEVEL SECURITY;

CREATE POLICY <table>_family_isolation ON <table>
  USING (family_id = current_setting('app.current_family_id', true))
  WITH CHECK (family_id = current_setting('app.current_family_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO tandem_app;
```

> Para `event_types` (que tiene `family_id` nullable para tipos base): la política permite lectura de los tipos base (`family_id IS NULL`) además de los de la Familia.

---

## Mapeo Pantalla → Endpoints

| Pantalla | Endpoints consumidos |
|----------|---------------------|
| **Hoy** | `GET /api/today` |
| **Compra** | `GET /api/shopping-items`, `POST /api/shopping-items`, `POST .../buy`, `POST .../undo`, `DELETE .../bought` |
| **Eventos** | `GET /api/events`, `GET /api/event-types`, `POST /api/events`, `PATCH ...`, `POST .../done`, `POST .../undo`, `POST /api/series`, `DELETE .../future` |
| **Hijos** (lista) | `GET /api/children?include=current_metrics` |
| **HijoDetail** | `GET /api/children/{id}`, `GET .../measurements`, `GET .../sizes/current`, `GET .../health-visits` |
| **Pautas** | `GET /api/pautas`, `POST /api/pautas/{id}/administrations`, `POST .../finish` |
| **Ajustes** | `GET /api/whoami`, `GET /api/members`, `GET /api/children`, `GET /api/mcp-tokens`, `POST /api/mcp-tokens`, `DELETE /api/mcp-tokens/{id}` |
