# 03 — Aviso de Evento por el mismo poller

Status: ready-for-agent

## What to build

Segundo disparador: los Miembros de la Familia reciben un **Aviso** push cuando se acerca un **Evento** de la Agenda. Extiende el poller del slice 02 a Eventos; reutiliza la tabla de envíos, el helper de envío y la ventana de gracia.

Decisión en `docs/adr/0007-notificaciones-push-web-push-poll.md`.

Alcance:
- **Dos avisos por Evento con hora** (`time` presente): **60 min antes** y **24 h antes** del instante del Evento.
- **Dos avisos por Evento de todo el día** (`time IS NULL`): a las **8:00 del día** del Evento y a las **8:00 del día anterior** (≈ 24 h antes).
- **Zona horaria**: el Evento guarda `date`+`time` sin zona; el backend los resuelve a instante absoluto en **`Europe/Madrid`** (fija en config). Las tomas no la necesitan (instante absoluto); aquí sí.
- **Anti-duplicado**: misma tabla de envíos, clave con discriminador de aviso: `(event_id, instante_del_evento, tipo_de_aviso)` donde `tipo_de_aviso` ∈ {lead_60m / lead_24h / morning_of / morning_before}. Editar el Evento cambia el instante ⇒ nueva clave, no reenvía el viejo.
- **Ventana de gracia 15 min** (reutilizada); Eventos cuyo aviso venció hace más de 15 min se marcan enviados sin mandar; Eventos ya pasados nunca se avisan.
- **Envío**: a todas las suscripciones de todos los Miembros de la Familia. Contenido **detallado** (título + hora; Hijo si el Evento lo tiene). `data.url` → pestaña **Eventos**.

Aislamiento por Familia (ADR-0005). Reutiliza la maquinaria del slice 02; este slice solo añade la lógica de Eventos (leads, todo-el-día, TZ, discriminador de aviso).

## Acceptance criteria

- [ ] Un Evento con hora genera dos Avisos (a 60 min y a 24 h antes), cada uno una sola vez por suscripción.
- [ ] Un Evento de todo el día genera dos Avisos (8:00 del día y 8:00 del día anterior), resueltos en `Europe/Madrid`.
- [ ] El instante se calcula correctamente cruzando cambios de hora/DST de `Europe/Madrid`.
- [ ] Editar fecha/hora del Evento reprograma de hecho (nueva clave); el aviso del instante viejo no se reenvía.
- [ ] Un aviso vencido hace > 15 min se marca enviado sin mandar; Eventos ya pasados no avisan.
- [ ] El Aviso llega a todas las suscripciones de la Familia; al tocar abre/enfoca la pestaña Eventos.
- [ ] TDD: tests primero. `pnpm test:backend` (Docker), `pnpm lint` pasan.

## Blocked by

- `02-aviso-administracion-poller` — reutiliza el proceso poller, la tabla de envíos, la ventana de gracia y el envío a las suscripciones de la Familia.

## Comments

<!-- Conversation history appends here -->
