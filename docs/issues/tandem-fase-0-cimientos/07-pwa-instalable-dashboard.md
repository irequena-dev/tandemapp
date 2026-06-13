## Parent

`docs/prd/tandem-fase-0-cimientos.md`

## What to build

El acabado del shell de la PWA: hacerla instalable y dejar listo el contenedor del dashboard. Incluye el `manifest.json` y un service worker que cachea assets (no offline-first: las operaciones de datos asumen conexión) para que la app se pueda instalar en el móvil, y un dashboard de inicio vacío con la navegación de Ajustes, preparado para que las fases siguientes coloquen sus widgets (compra pendiente, talla actual, próxima toma, eventos de hoy).

## Acceptance criteria

- [ ] La PWA es instalable en móvil (`manifest.json` válido + service worker registrado).
- [ ] El service worker cachea assets para arranque rápido; no implementa offline de datos ni cola de mutaciones.
- [ ] Existe una pantalla de dashboard de inicio (vacía) como contenedor para widgets futuros.
- [ ] Existe navegación a Ajustes (Hijos, token MCP, miembros).
- [ ] Cubierto por la costura de ruta/página (el dashboard y la navegación renderizan correctamente).

## Blocked by

- 01-esqueleto-auth-clerk.md
