---
status: accepted
---

# Notificaciones push: Web Push (VAPID) disparadas por un poll sin estado

Tándem nació **pull-only** (sin push; "tiempo real" = optimistic + refetch) y declaró las notificaciones push **fuera de alcance** en el PRD MVP. Esta decisión **revierte** esa postura para dos disparadores programados —la **Administración** que toca (vía `next_dose_at` de la Pauta) y el **Evento** próximo de la Agenda— y deja registrado el cómo. Email y "notificar cualquier cambio" siguen fuera de alcance.

## Decisión

- **Transporte: Web Push estándar con VAPID**, sin proveedor externo. El backend firma y envía con `pywebpush`; el navegador entrega por su propio servicio (Apple/Google/Mozilla). Sin SDK propietario, sin coste, sin que datos de la Familia salgan a un tercero.
- **Destinatarios: todos los Miembros de la Familia** (todos sus dispositivos suscritos). No se introduce un concepto de "asignado/responsable"; la unidad sigue siendo la Familia (RLS por `family_id`).
- **Disparo: poll de 1 minuto sin estado**, en un **proceso único dedicado** (no en cada worker de la API, para no duplicar envíos). Cada minuto relee el estado real (tomas con `next_dose_at` vencido y sin Administración posterior; Eventos cuyo aviso vence) y envía.
- **Anti-duplicado: tabla append-only de envíos**, con clave por instante y tipo de aviso: toma → `(pauta_id, next_dose_at)`; evento → `(event_id, instante_del_evento, tipo_de_aviso)`. Como `next_dose_at` cambia al registrar una Administración, el nuevo instante es una clave distinta y nunca se reenvía el mismo aviso.
- **Caducidad: ventana de gracia de 15 min**. Si un aviso vence con más de 15 min de retraso (p. ej. el proceso estuvo caído), se marca como enviado **sin** mandar nada; los Eventos ya pasados nunca se envían.
- **Antelación**: toma → instante exacto de `next_dose_at`. Evento con hora → **60 min y 24 h antes**. Evento de todo el día (`time IS NULL`) → **8:00 del día** y **24 h antes** (8:00 del día anterior).
- **Zona horaria: `Europe/Madrid` fija en config**. Las tomas usan `next_dose_at` absoluto (UTC) y no la necesitan; los Eventos guardan `date`+`time` sin zona, así que el backend los resuelve a instante con esta TZ.
- **Contenido: detallado sin diagnóstico** (Hijo + medicamento/dosis para la toma; título + hora para el evento). Nunca se expone la Visita médica ni diagnósticos. Deep-link al tocar: toma → pestaña **Hoy**; evento → pestaña **Eventos** (vía `data.url` + `notificationclick`).
- **Sin horas de silencio en v1**: una toma se avisa a su hora exacta aunque sea de madrugada (saltarse una dosis es peor que el aviso nocturno).
- **Activación (PWA): toggle opt-in en Ajustes** (no prompt al cargar). Al activar: `Notification.requestPermission()` → `pushManager.subscribe(VAPID public)` → `POST` de la suscripción. La suscripción es **por dispositivo/navegador**. Borrado automático cuando el envío devuelve **410/404**; el toggle off hace `unsubscribe()` + `DELETE`.

## Considered Options

- **Proveedor externo (FCM / OneSignal / Expo)**: rechazado. Mete dependencia y cuenta de terceros y saca datos de la Familia fuera; el valor (analytics) no compensa para una app familiar privada.
- **Cola de tareas diferidas (Celery/arq + Redis) o scheduler in-process con job por aviso**: rechazado. Programar el envío por adelantado obliga a **cancelar/reprogramar** el job en cada edición de Pauta/Evento o registro de Administración — justo el fan-out "reacciona a cada cambio" que el producto evita. El poll **sin estado** relee el estado actual, así que ediciones y cancelaciones "simplemente funcionan" y sobrevive a reinicios sin jobstore. El coste de pollear a este volumen (una query indexada que casi siempre da 0 filas) es irrelevante; el intervalo de 1 min es por **puntualidad**, no por carga.
- **Notificaciones locales en el dispositivo (Notification Triggers API en el SW)**: rechazado. Soporte muy irregular y obliga a recalcular en cliente.
- **`timezone` por Familia o por suscripción** en vez de TZ fija: pospuesto. Una sola TZ desambigua el "8:00 mañana-de"; se promoverá a campo de `Family` si aparece una Familia fuera de `Europe/Madrid`.

## Consequences

- Aparece **infra de fondo nueva**: un proceso poller dedicado (proceso aparte en el despliegue) y una tabla de suscripciones push (`family_id`, `member_id`, endpoint + claves) más la tabla de envíos, ambas bajo RLS por `family_id`.
- **Claves VAPID** como secretos de backend (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`); la pública se sirve por `GET /api/push/vapid-public-key` para rotar sin rebuild del frontend.
- Se **extiende el service worker actual** (`frontend/public/sw.js`, hecho a mano, solo-assets) con handlers `push` y `notificationclick`; no se introduce VitePWA.
- **iOS** solo soporta Web Push con la PWA instalada (iOS 16.4+); irrelevante hoy (Miembros en Android) pero condiciona a usuarios iOS futuros.
- Ampliar a más disparadores o a notificar cambios de otros Miembros sería una **nueva decisión** (no está cubierto aquí).
