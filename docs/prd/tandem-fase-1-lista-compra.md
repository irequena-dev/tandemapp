# Fase 1 — Lista de la compra

> Parte del roadmap de [Tándem](./tandem-plataforma-mvp.md). Depende de la [Fase 0 — Cimientos](./tandem-fase-0-cimientos.md).
> Vocabulario: glosario de `CONTEXT.md`. Decisiones de calado: ADR-0002 (backend sin NLP).
> Esta fase es el **tracer bullet** de extremo a extremo: fija el *prior art* de las costuras de dominio (REST, MCP, ruta de frontend) que imitan las fases siguientes.

## Problem Statement

Como Miembro de una familia, lo que hay que comprar se me ocurre con las manos ocupadas (cocinando, viendo que se acaba algo) y lo gestionamos varios, así que se nos olvida o lo compramos por duplicado. Quiero apuntar cosas al vuelo y, en el súper, ir tachando rápido sin teclear ni perder lo que ya había.

## Solution

Una lista de la compra única y compartida por Familia. Apunto artículos dictándolos a Claude ("pañales talla 4, leche y pan") y, en la PWA, veo la lista y tacho lo comprado con respuesta instantánea. Lo comprado no se borra: se agrupa/oculta, se puede deshacer y limpiar cuando quiera. Si mi pareja cambia algo, lo veo al volver a la app.

## User Stories

1. Como Miembro, quiero dictar varios artículos de golpe ("pañales talla 4, leche y pan"), para añadirlos sin teclear.
2. Como Miembro, quiero que cada Ítem de compra se guarde como texto libre, para no pelearme con cantidades y unidades.
3. Como Miembro, quiero ver la lista única de la compra de mi Familia, para saber qué falta.
4. Como Miembro, quiero tachar un ítem al comprarlo, con respuesta instantánea, para ir marcando en el súper.
5. Como Miembro, quiero deshacer un ítem tachado por error, para no perderlo.
6. Como Miembro, quiero que los ítems comprados se agrupen/oculten en vez de borrarse, para reañadirlos fácilmente.
7. Como Miembro, quiero limpiar los comprados cuando quiera, para dejar la lista limpia.
8. Como Miembro, quiero añadir un ítem también desde la PWA, para apuntar cuando tengo la app delante.
9. Como Miembro, quiero editar o borrar un ítem desde la PWA, para corregir un dictado equivocado.
10. Como Miembro, quiero que lo que añada o tache mi pareja se refleje al volver a la app, para que la lista esté al día entre ambos.
11. Como Miembro, quiero ver en "Hoy" (tarjeta de "Más cosas") cuántos ítems quedan pendientes, para saber de un vistazo si hay compra que hacer.
12. Como Miembro, quiero ver quién marcó comprado un ítem, para coordinarme con el otro Miembro y no comprarlo por duplicado.

## Implementation Decisions

### Módulos
- Backend: módulo de compra en REST y una herramienta MCP de alta. Reutiliza el contexto de Familia y RLS de la Fase 0.
- Frontend: pantalla **Compra** (pestaña) + tarjeta de resumen "Compra" en el bloque "Más cosas" de **Hoy**.

### Esquema
- `shopping_items`: `id`, `family_id`, `text` (texto libre), `status` (`pending` | `bought`), `created_by`, **`bought_by`** y **`bought_at`** (quién y cuándo lo marcó comprado; se fijan al tachar y se limpian al deshacer), timestamps. **Lista única por Familia** (no hay entidad lista). El destinatario ("para Mateo") va **dentro de `text`**; no hay campo de nota aparte.

### Contratos
- **REST**: listar ítems (con agrupación pendiente/comprado), crear, editar texto, tachar (pending→bought), deshacer (bought→pending), limpiar comprados, borrar. Todo acotado a la Familia.
- **MCP**: `add_shopping_items(items: list[str])` — inserta varios ítems en estado `pending` bajo la Familia del token. (Tachar/limpiar **no** se exponen por voz en v1.)

### Reglas
- Marcar comprado **conserva** el ítem (no borra); deshacer y limpiar disponibles.
- Al tachar se registra **quién lo compró** (`bought_by`/`bought_at`, Miembro del JWT); al deshacer se limpia esa atribución.
- Se aceptan duplicados (inofensivos y corregibles); no hay deduplicación.

### Frontend
- Pantalla **Compra** (ver [IA y pantallas](./tandem-ia-pantallas.md)): dos secciones **"Por comprar"** y **"Comprado"** (comprados agrupados/colapsados; pendientes arriba). Fila = checkbox + **texto libre** del Ítem + chip de estado; al tachar muestra **quién lo compró**.
- **Contadores** de pendientes en el header de la sección.
- **Optimistic updates** en tachar/deshacer/añadir + refetch al enfocar (patrón base de la Fase 0). Acción de "deshacer" tras tachar; **limpiar comprados**.
- Aporte a **Hoy**: tarjeta "Compra" en el bloque "Más cosas" con el contador de pendientes ("X por comprar"; tono suave si no hay nada).

## Testing Decisions

- Buenos tests: comportamiento externo, no internals. Postgres real.
- **Costura HTTP/REST**: crear/listar/tachar/deshacer/limpiar/editar/borrar contra Postgres real; verificar estados y conservación al comprar.
- **Costura MCP**: `add_shopping_items` con `Authorization: Bearer`; verificar que inserta en `pending` bajo la Familia correcta y el aislamiento (no aparece en otra Familia).
- **Costura de ruta/página (frontend)**: renderizar la página real, con red mockeada en el límite HTTP (**MSW**); verificar optimistic update al tachar, deshacer, y que los comprados se agrupan. **No** mockear TanStack Query por dentro.
- Esta fase **establece el prior art** que reutilizan las Fases 2–4.

## Out of Scope

- Varias listas o categorización de la compra (lista única en v1).
- Tachar/limpiar por voz (mutaciones por voz reservadas al flujo clínico, Fase 3).
- Ítems estructurados (cantidad/unidad): solo texto libre.
- Sugerencias automáticas (p. ej. enlazar "pañales talla X" con la Talla del Hijo).

## Further Notes

- Por ser el tracer bullet, conviene cuidar aquí la calidad de los tres tipos de costura: serán la referencia copiada por las demás fases.
- La tarjeta de "Más cosas" en **Hoy** (pendientes) es el primer "inquilino" del contenedor de inicio creado vacío en la Fase 0.
