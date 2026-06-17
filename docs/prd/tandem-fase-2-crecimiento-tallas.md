# Fase 2 — Crecimiento y tallas

> Parte del roadmap de [Tándem](./tandem-plataforma-mvp.md). Depende de la [Fase 0 — Cimientos](./tandem-fase-0-cimientos.md). Imita el *prior art* de la [Fase 1](./tandem-fase-1-lista-compra.md).
> Vocabulario: glosario de `CONTEXT.md`. Decisiones: ADR-0002 (backend sin NLP).

## Problem Statement

Como Miembro de una familia, nunca recuerdo cuánto mide o pesa mi Hijo ahora ni cómo va su crecimiento, y cuando voy a comprar ropa o zapatos dudo de la talla y acabo comprando mal. Apuntarlo en notas sueltas pierde el histórico y se desordena.

## Solution

Registro Medidas (altura, peso) y Tallas (ropa, calzado) dictándolas a Claude ("Lucas pesa 14 kilos", "Marta calza un 26"). Cada Medida se guarda con su fecha sin pisar la anterior, así veo la evolución; y consulto de un vistazo el último valor y la Talla actual para acertar al comprar. Si me equivoco al dictar, lo corrijo en la PWA.

## User Stories

1. Como Miembro, quiero dictar una Medida ("mide 95 centímetros", "pesa 14 kilos"), para registrar el crecimiento sin teclear.
2. Como Miembro, quiero que cada Medida se guarde con su fecha sin sobrescribir la anterior, para ver la evolución.
3. Como Miembro, quiero ver la evolución de altura y peso de un Hijo, para seguir su crecimiento.
4. Como Miembro, quiero ver destacado el último valor de cada Medida, para conocer el dato actual de un vistazo.
5. Como Miembro, quiero dictar una Talla ("calza un 26", "usa ropa de la 6"), para registrar lo que le vale ahora.
6. Como Miembro, quiero consultar la Talla actual de ropa y calzado de cada Hijo, para acertar al comprar.
7. Como Miembro, quiero que los tipos de Medida (altura, peso) y de Talla (ropa, calzado) sean un conjunto conocido, para que los datos no se fragmenten.
8. Como Miembro, quiero registrar Medidas y Tallas también desde la PWA, para apuntar cuando tengo la app delante.
9. Como Miembro, quiero corregir o borrar una Medida o Talla errónea desde la PWA, para arreglar un dato mal dictado (p. ej. una altura imposible).
10. Como Miembro, quiero ver en el card de cada Hijo (pestaña Hijos) su talla actual de calzado/ropa, para tenerla a mano al salir de compras.

## Implementation Decisions

### Módulos
- Backend: módulo de crecimiento/tallas en REST + herramientas MCP de alta. Reutiliza Familia/RLS (Fase 0) y patrón REST/MCP/frontend (Fase 1).
- Frontend: **no** hay pestaña propia; el crecimiento y las tallas viven dentro de **Hijos → HijoDetail** (ver [IA y pantallas](./tandem-ia-pantallas.md)). El valor actual (altura, peso, talla de calzado y ropa) se asoma en el **card de Hijo**.

### Esquema

> Contrato completo en [`docs/api-contract.md`](../api-contract.md).

- `measurements`: `id` (UUID), `family_id`, `child_id`, `type` (`height` | `weight`), `value` (NUMERIC), `unit` (`cm` | `kg`), `measured_at` (DATE), `recorded_by` (member_id), `created_at`. **Append-only**; el valor actual es el más reciente por tipo. Índice: `(child_id, type, measured_at DESC)`.
- `sizes`: `id` (UUID), `family_id`, `child_id`, `type` (`clothing` | `footwear`), `label` (TEXT, p. ej. "5-6 años", "29", "24-36 meses"), `recorded_at` (DATE), `recorded_by` (member_id), `created_at`. **Append-only**; la actual es la más reciente por tipo. El tipo `clothing` se muestra al usuario como **"Talla"** (no "Ropa"); el tipo `footwear` como **"Calzado"**. Índice: `(child_id, type, recorded_at DESC)`.

### Contratos
- **REST**: listar histórico por Hijo y tipo; obtener valor/talla actual; crear; editar; borrar (correcciones). Acotado a la Familia.
- **MCP**:
  - `record_measurement(child_name, type, value, unit)` — `type ∈ {height, weight}`.
  - `record_size(child_name, type, label)` — `type ∈ {clothing, footwear}`.
  - Resolución de `child_name` por **matching estricto** (contrato de la Fase 0): si no encaja, error estructurado con Hijos válidos.

### Reglas
- Distinción de dominio: **Medida** (numérica, evolución) vs **Talla** (etiqueta, valor actual para comprar). No se unifican.
- Tipos en **conjunto fijo y curado** en código; la IA debe encajar en uno o devolver error (no inventa tipos).
- "Actual" = registro más reciente (derivado por consulta, no almacenado aparte).

### Frontend
- En **HijoDetail**, sección **Crecimiento**: vista de evolución (altura/peso en el tiempo) con el valor actual destacado, talla actual de ropa/calzado bien visible para el caso "compra", y alta/corrección de Medidas y Tallas desde la PWA.
- En el **card de Hijo** (pestaña Hijos): altura, peso, talla de calzado y talla de ropa actuales, de un vistazo.

## Testing Decisions

- Postgres real; comportamiento externo, no internals.
- **Costura HTTP/REST**: crear varias Medidas del mismo tipo y verificar que se conservan todas (append-only) y que "actual" devuelve la más reciente; lo mismo para Tallas; correcciones (editar/borrar).
- **Costura MCP**: `record_measurement` y `record_size` con token; verificar encaje de tipos válidos, rechazo de tipos no curados, y matching estricto de Hijo (error estructurado).
- **Costura de ruta/página (frontend)**: con MSW, verificar evolución y valor/talla actual, y la corrección desde la UI.
- Prior art: las costuras de la Fase 1.

## Out of Scope

- Curvas de percentil OMS y, por tanto, el sexo del Hijo (solo nombre + fecha de nacimiento).
- Tipos de Medida/Talla abiertos o creados por la IA.
- Alertas/avisos por cambios de talla.
- Enlace automático entre Talla y lista de la compra.

## Further Notes

- La fecha de nacimiento del Hijo (Fase 0) da contexto de edad para mostrar junto a la evolución, sin implicar percentiles.
