# Tándem — IA y pantallas (transversal)

> Artefacto **transversal** del roadmap de [Tándem](./tandem-plataforma-mvp.md). Define la **arquitectura de información** (navegación) y el **contenido de cada pantalla** de la PWA. Cruza varias fases: el _shell_ (navegación, header, Ajustes) y la pantalla **Hoy** no pertenecen a ninguna fase concreta; cada fase **rellena** su parte de forma incremental.
>
> Vocabulario: glosario en `CONTEXT.md`. Estética y tokens: `DESIGN.md` y `PRODUCT.md` (normativos para UI). Decisiones de calado en `docs/adr/`.
>
> Este doc **manda** sobre la IA y el contenido de pantalla; cada PRD de fase detalla los contratos (REST/MCP), el esquema y los tests de su rebanada.

## Principios de IA

- **Una Familia por Miembro** (decisión transversal): no hay cambio de Familia en la UI; **sin `OrganizationSwitcher`**.
- **Consulta rápida con una mano**: lo glanceable primero; el estado se entiende en ~3 s (ver `DESIGN.md`).
- **La voz (Claude/MCP) es el camino estrella para dictar**; la PWA es para consultar, validar y corregir. Toda mutación de la PWA usa _optimistic update_ + refetch al enfocar.
- **Degradación incremental**: las pantallas se definen como objetivo completo (todas las fases). Mientras una fase no esté construida, su parte de **Hoy** (héroe, timeline, tarjetas) simplemente no aparece.

## Shell

Persistente en toda la app autenticada.

### Header (global)

- **Izquierda**: logo + wordmark "Tándem" (enlaza a Hoy).
- **Derecha**: icono de **Ajustes** (abre el overlay de Ajustes).
- Sin `OrganizationSwitcher`. La cuenta (perfil, cerrar sesión) vive **dentro de Ajustes**, no en el header.

### Barra de navegación inferior (fija, persistente)

5 pestañas; cambia la vista principal:

1. **Hoy** — inicio: agenda del día y lo urgente.
2. **Compra** — lista de la compra (Fase 1).
3. **Eventos** — agenda de próximos Eventos (Fase 4).
4. **Hijos** — listado de Hijos; detalle con crecimiento, tallas y visitas (Fases 0/2/3).
5. **Pautas** — tratamientos activos/finalizados de la Familia (Fase 3).

> Crecimiento y tallas (Fase 2) **no** tiene pestaña propia: vive dentro de **Hijos → HijoDetail**.

## Hoy

Pantalla de inicio. Combina aportes de varias fases.

1. **Header** global (logo + Ajustes).
2. **Héroe "Ahora"** — destaca **una** cosa urgente del momento:
   - **Prioridad**: Administración de una Pauta **vencida o inminente** primero; si no hay, el **Evento más inmediato de hoy**.
   - Muestra contexto (p. ej. medicación + Hijo, día X de Y del tratamiento) y una **acción contextual** (marcar tomada / marcar hecho) con **Deshacer**.
   - **Estado calmado**: si no hay toma pendiente ni evento inminente, mensaje sereno ("Nada urgente ahora · todo en orden"), sin acción.
3. **Timeline del día** — cronológico, compuesto por:
   - Por cada **Pauta activa**: la **próxima** toma calculada (modelo por intervalo de Fase 3, **sin** horarios pre-generados) **+** las Administraciones **ya dadas hoy** como hitos completados.
   - Los **Eventos de hoy** (Fase 4), incluida una cita médica (que es un Evento de tipo médico, no una Visita).
4. **"Más cosas"** — bloque de 4 tarjetas de **resumen de estado** y atajo; **todas navegan** a su destino (la redundancia con la barra inferior es intencionada por el valor de _vistazo_):
   1. **Compra** — contador dinámico ("X por comprar"); en tono suave si no hay nada pendiente.
   2. **Pautas** — resumen ("1 activa · 1 finalizada").
   3. **Próxima cita** — próximo **Evento de tipo médico** (p. ej. "Control de Mateo · 28 may"); navega a **Eventos**. _(No es una "Visita médica": la cita futura es un Evento; la Visita es histórica.)_
   4. **Hijos** — estado ("Al día"); navega a la pestaña Hijos.

## Compra

Fase 1. Lista única compartida por Familia.

- Dos secciones: **"Por comprar"** y **"Comprado"** (comprados agrupados/colapsados).
- Cada fila: checkbox + **texto libre** del Ítem (el destinatario, "para Mateo", va **dentro del texto**; no hay campo aparte) + chip de estado.
- Al marcar comprado: se **conserva** el ítem y se muestra **quién lo compró** (`bought_by`); **Deshacer** disponible.
- **Limpiar comprados** cuando se quiera.
- **Contadores** de pendientes en el header de la sección.
- Alta de Ítem también desde la PWA; editar/borrar para corregir un dictado.
- _Optimistic update_ en tachar/deshacer/añadir.

## Eventos

Fase 4. **Lista de próximos** (no calendario).

- Lista de próximos Eventos con **estado** (pendiente / hecho / atrasado).
- **Filtros** por tipo de Evento y por Hijo.
- **Marcar hecho / deshacer** (solo manual; pasar la fecha no completa nada) con _optimistic update_.
- **Crear Evento** suelto desde la PWA.
- **Gestionar Tipos de Evento** y **crear / borrar Series** (acotadas, materializadas; ADR-0003) **dentro de esta pestaña** (Ajustes no se ocupa de la agenda).

## Hijos

Fases 0 (identidad) + 2 (crecimiento/tallas) + 3 (visitas).

- Un **card por Hijo**: avatar con **inicial + color** del Hijo, nombre, edad (derivada de la fecha de nacimiento), **altura** actual, **peso** actual, **talla de calzado** actual y **talla** actual (rango de edad, p. ej. "5-6 años", "24-36 meses").
- Click en el card abre **HijoDetail**.
- La **identidad** del Hijo (alta/baja, nombre, fecha de nacimiento, color) se gestiona en **Ajustes**, no aquí.

### HijoDetail

- **Card resumen comprimida** con la info básica del Hijo.
- **Crecimiento** (Fase 2): gráficas de evolución de **altura** (cm) y **peso** (kg) en el tiempo (eje X = fecha, eje Y = valor), tabla de histórico, **talla** actual y **talla de calzado** actual, y alta/corrección de Medidas y Tallas desde la PWA.
- **Visitas médicas** (Fase 3): listado con **filtro por fecha**; **registrar** una Visita desde la PWA (US 13 de Fase 3) y **corregir/borrar**; click en una Visita abre su **detalle** (diagnóstico, notas/tratamiento) con **enlace a las Pautas** que originó (lleva al tab **Pautas** del propio Hijo, que incluye también las finalizadas).
- **Pautas** (Fase 3): tab por Hijo que hace de **historial** — las Pautas del Hijo en dos subsecciones, **Activas** (misma funcionalidad que la pestaña global Pautas: marcar toma, finalizar, progreso) y **Finalizadas** (recesadas, colapsadas por defecto). Filtra por el Hijo actual; no repite avatar/nombre del Hijo en cada tarjeta (contexto ya implícito).

## Pautas

Fase 3. Tratamientos **activos** de **toda la Familia** (cross-Hijo). El **historial** (finalizadas) NO vive aquí: se consulta por Hijo en **HijoDetail → tab Pautas**.

- **Lista** de Pautas **activas** ordenada por **urgencia** (próxima toma); cada fila muestra **avatar + nombre del Hijo** al que pertenece la Pauta.
- Cada Pauta **expandible**:
  - **Curso del tratamiento**: día X de Y, barra de progreso.
  - **Tomas del día** con estado (**Dada** / **Próxima** / **Pendiente**) y **quién** la dio.
  - Botón **"Marcar toma"** para la próxima dosis.
- Acciones en la PWA: **marcar toma** (_optimistic_ + deshacer), **iniciar** Pauta y **finalizar** Pauta. (La voz sigue siendo el camino estrella para iniciar y administrar.)
- Al **finalizar** una Pauta sale de esta lista; su historial queda en el tab Pautas del Hijo.

## Ajustes (overlay)

Overlay sobre la vista actual; se abre desde el icono del header.

- **Familia**: nombre (es la Organización de Clerk).
- **Miembros**: roster con avatar, nombre y rol; **invitar** por enlace.
- **Hijos**: roster **editable** de identidad — **Añadir / Quitar** y editar. "Añadir" abre un formulario inline con **preview de avatar**, nombre, **fecha de nacimiento** y **selector de color**. _(Los datos de crecimiento/visitas se gestionan en HijoDetail, no aquí.)_
- **Token MCP**: generar / revocar (Fase 0; conexión de Claude).
- **Apariencia**: tema **Sistema / Claro / Oscuro** (por defecto **Sistema**; la elección persiste por dispositivo).
- **Cuenta**: perfil y cerrar sesión (Clerk `UserButton`).

## Impacto en el esquema

> Esquema consolidado en [`docs/api-contract.md`](../api-contract.md).

Cambios derivados de esta definición de pantallas (detallados en cada PRD de fase):

- **Fase 0** — `children` añade **`avatar_color`** (SMALLINT 0–5) para el avatar inicial + color.
- **Fase 1** — `shopping_items` añade **`bought_by`** y **`bought_at`** para mostrar quién compró cada Ítem.
- **Fase 2** — `sizes.type = 'clothing'` se muestra como **"Talla"** (no "Ropa"); `label` usa formato de rango de edad (p. ej. "5-6 años").
- **Fase 4** — `event_types` añade **`icon`** (TEXT, clave del design system) para el icono visual por tipo.

## Notas

- **Eventos** se mantiene como **lista** (no calendario): encaja con el modelo de "próximos + atrasados" de la Fase 4 y deja la vista del día concreto a **Hoy**.
- **Salud** se reparte: las **Pautas** (lo accionable del día a día) en su pestaña; las **Visitas médicas** (histórico por Hijo) en **HijoDetail**. Esto sustituye a la "página Salud" única que insinuaba el PRD de Fase 3.
- El avatar del Hijo (inicial + color) es consistente en el card de Hijos, en HijoDetail y en las filas de Pautas.
