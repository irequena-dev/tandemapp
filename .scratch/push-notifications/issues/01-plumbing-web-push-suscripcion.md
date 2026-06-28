# 01 — Plumbing de Web Push + suscripción opt-in (tracer bullet)

Status: ready-for-agent

## What to build

Tracer bullet que fija el *prior art* de push en Tándem, **sin disparadores de dominio todavía**. Un Miembro activa las notificaciones desde el overlay **Ajustes** de la PWA, su dispositivo queda suscrito, y se puede comprobar la entrega de un push de prueba que al tocarse abre la PWA. Cruza todas las capas (DB → API → service worker → PWA) extremo a extremo.

Decisión de diseño en `docs/adr/0007-notificaciones-push-web-push-poll.md` (Web Push estándar con VAPID, sin proveedor externo; suscripción por dispositivo; aislamiento por Familia).

Alcance:
- **DB**: nueva tabla de **suscripciones push** por dispositivo, con `family_id` y `member_id`, el `endpoint` y las claves (`p256dh`, `auth`). Bajo **RLS** por `family_id` igual que el resto de tablas (filtrado de aplicación + RLS como red; ver ADR-0005). El backend fija `family_id`/`member_id` desde el contexto autenticado; el cliente nunca los envía.
- **Secretos / config**: claves **VAPID** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) en la config del backend.
- **API REST** (autenticada con JWT de Clerk, atribuida al Miembro):
  - `GET /api/push/vapid-public-key` → la pública (permite rotar sin rebuild del frontend).
  - alta de suscripción (idempotente por `endpoint`) y baja de suscripción.
- **Envío**: helper de backend que firma y manda un Web Push con `pywebpush` a una suscripción; al recibir **410/404** del servicio de push, **borra** esa suscripción. Para este slice basta una forma de disparar un envío de prueba (p. ej. endpoint dev-only o comando), no hay poller aún.
- **Service worker**: extender el `sw.js` actual (hecho a mano, solo-assets) con handlers `push` (muestra la notificación) y `notificationclick` (enfoca una pestaña abierta o abre la PWA en `data.url`). No introducir VitePWA.
- **PWA**: toggle opt-in en **Ajustes** ("Activar notificaciones"). Al activar: `Notification.requestPermission()` → `pushManager.subscribe(applicationServerKey = VAPID public)` → alta en backend. Al desactivar: `unsubscribe()` + baja en backend. El toggle refleja el estado real del permiso/suscripción del dispositivo.

## Acceptance criteria

- [ ] Existe la tabla de suscripciones push con RLS por `family_id`; un test de aislamiento confirma que una Familia no ve/borra suscripciones de otra.
- [ ] `GET /api/push/vapid-public-key` devuelve la clave pública configurada.
- [ ] Alta de suscripción: persiste `endpoint` + claves atribuidos al Miembro/Familia del JWT; reactivar el mismo `endpoint` no duplica (idempotente).
- [ ] Baja de suscripción elimina la fila.
- [ ] El helper de envío manda un Web Push real y, ante 410/404, borra la suscripción muerta (verificado con el servicio de push simulado en la costura de tests).
- [ ] `sw.js` maneja `push` (muestra notificación con título/cuerpo/`data.url`) y `notificationclick` (enfoca/abre en `data.url`).
- [ ] En Ajustes, el toggle pide permiso, suscribe y da de alta; al desactivar, desuscribe y da de baja; refleja el estado del dispositivo al recargar.
- [ ] TDD: tests primero. `pnpm test:backend` (Docker), `pnpm test:frontend`, `pnpm lint` y `pnpm -C frontend exec tsc -b` pasan.

## Blocked by

- None - can start immediately

## Comments

<!-- Conversation history appends here -->
