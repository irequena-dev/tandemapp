## Parent

`docs/prd/tandem-ia-pantallas.md`

## What to build

Las partes del overlay **Ajustes** que no pertenecen a una fase de dominio concreta: **Apariencia** y **Cuenta**.

- **Apariencia**: selector de tema **Sistema / Claro / Oscuro** (por defecto **Sistema**); la elección **persiste por dispositivo** y aplica los tokens de `DESIGN.md` (claro y oscuro a AA).
- **Cuenta**: perfil y cerrar sesión vía el `UserButton` de Clerk, **dentro de Ajustes** (no en el header).

El resto del overlay (Familia, Miembros, Hijos, Token MCP) ya lo cubren las issues de Fase 0; esta rebanada solo añade Apariencia y Cuenta y deja el overlay completo en su parte transversal.

## Acceptance criteria

- [ ] El overlay Ajustes se abre desde el icono del header y se cierra sobre la vista actual.
- [ ] La sección Apariencia ofrece Sistema / Claro / Oscuro, por defecto Sistema, y la elección persiste por dispositivo entre recargas.
- [ ] Al elegir Claro/Oscuro/Sistema, la app aplica el tema correspondiente con los tokens del design system.
- [ ] La sección Cuenta muestra el `UserButton` de Clerk (perfil + cerrar sesión) dentro de Ajustes.
- [ ] Cubierto por la costura de ruta/página con MSW (apertura del overlay, cambio de tema, persistencia).

## Blocked by

- Fase 0 completa (`docs/issues/tandem-fase-0-cimientos/`).
