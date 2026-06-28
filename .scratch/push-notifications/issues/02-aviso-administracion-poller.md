# 02 — Aviso de Administración (toma) por poller sin estado

Status: ready-for-agent

## What to build

Primer disparador de dominio real: cuando a un Hijo le **toca** una dosis de una Pauta activa, todos los Miembros de la Familia reciben un **Aviso** push. Reutiliza el plumbing del slice 01 y añade el motor de disparo.

Decisión en `docs/adr/0007-notificaciones-push-web-push-poll.md`. Glosario: **Aviso** (`CONTEXT.md`).

Alcance:
- **Proceso poller**: proceso **único dedicado** (no en cada worker de la API, para no duplicar envíos) que cada ~1 min relee el estado real y envía. **Sin estado** respecto a los datos de dominio: no programa nada por adelantado, así que registrar una Administración / editar / finalizar la Pauta "simplemente funciona" en el siguiente ciclo. Despliegue como proceso aparte.
- **Query de vencimiento**: Pautas activas cuya **próxima toma** (`next_dose_at`, la última Administración + intervalo) ya venció y no tiene una Administración posterior.
- **Anti-duplicado**: tabla **append-only de envíos** con clave por instante: `(pauta_id, next_dose_at)`. Como `next_dose_at` cambia al registrar una Administración, el nuevo instante es clave distinta y nunca se reenvía el mismo Aviso. La tabla lleva `family_id` y va bajo RLS.
- **Ventana de gracia 15 min**: si la toma venció hace más de 15 min (p. ej. el proceso estuvo caído), se marca como enviada **sin** mandar nada.
- **Envío**: a **todas** las suscripciones de **todos los Miembros** de la Familia del Hijo, vía el helper del slice 01 (con su limpieza de 410/404). Contenido **detallado sin diagnóstico**: Hijo + medicamento/dosis. `data.url` → pestaña **Hoy** (héroe "Ahora").
- **Sin horas de silencio**: la toma se avisa a su hora exacta aunque sea de madrugada.

Respeta `resolve_child_by_name`/ADR-0006 donde aplique y el aislamiento por Familia (ADR-0005). Reutiliza, no dupliques, la lógica de "próxima toma" del dominio de Pauta existente.

## Acceptance criteria

- [ ] El poller corre como proceso único; arrancar dos instancias no produce envíos duplicados (el dedup por `(pauta_id, next_dose_at)` lo garantiza).
- [ ] Una Pauta con `next_dose_at` dentro de la ventana genera **exactamente un** Aviso por suscripción, una sola vez (ciclos repetidos no reenvían).
- [ ] Registrar la Administración hace que el siguiente ciclo apunte al nuevo `next_dose_at` y no reenvíe el anterior.
- [ ] Una toma vencida hace > 15 min se marca enviada sin mandar push.
- [ ] El Aviso llega a todas las suscripciones de todos los Miembros de la Familia; suscripciones 410/404 se limpian.
- [ ] Contenido detallado sin diagnóstico; al tocar abre/enfoca la pestaña Hoy.
- [ ] La tabla de envíos está bajo RLS por `family_id` (test de aislamiento).
- [ ] TDD: tests primero. `pnpm test:backend` (Docker), `pnpm lint` pasan.

## Blocked by

- `01-plumbing-web-push-suscripcion` — necesita la tabla de suscripciones, el helper de envío con limpieza 410/404 y los handlers del service worker.

## Comments

<!-- Conversation history appends here -->
