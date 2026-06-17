# Gaps — Pantallas UI (para sesión interactiva)

> Documento generado tras construir el frontend estático/mockeado. Recoge los
> puntos que no están definidos en `tandem-ia-pantallas.md` y que conviene
> cerrar antes de conectar el backend real. Se pueden resolver en una sesión
> interactiva de refinamiento.

## 1. Empty states — copy y comportamiento

Cada pantalla necesita un empty state. Se han inventado textos razonables
basados en el tono de PRODUCT.md, pero convendría validar:

| Pantalla | Estado vacío actual | Decisión pendiente |
|---|---|---|
| Hoy · hero | "Nada urgente ahora · todo en orden" | ¿Cambia el copy si no hay ningún Hijo? |
| Hoy · timeline | No se muestra | ¿Mostrar algo o simplemente no renderizar la sección? |
| Compra | "Lista vacía · Añade lo que necesites comprar, o díctalo por voz a Claude." | OK / ajustar |
| Eventos | "Sin eventos próximos" | OK / ajustar |
| Hijos (tab) | "Aún no hay Hijos · Ve a Ajustes…" | ¿Botón directo a Ajustes o solo texto? |
| Hijos (detail) · crecimiento | "Aún no hay medidas registradas" | OK / ajustar |
| Hijos (detail) · visitas | "Sin visitas médicas registradas" | OK / ajustar |
| Pautas | "Sin pautas activas" | OK / ajustar |

## 2. Error states

No hay spec para errores de red, errores del backend, ni estados de error
parciales (p.ej. "no se pudo marcar como comprado"). Se ha construido todo
como estático; al conectar con el backend habrá que definir:

- **Patrón global de error**: ¿toast con reintentar? ¿inline como en ChildrenPage?
- **Retry automático** vs. manual
- **Error en /whoami** (identidad): ¿bloquear toda la app o mostrar estado degradado?

## 3. Loading states / skeletons

Solo ChildrenPage (existente) tiene skeleton. Las nuevas pantallas no tienen
loading state porque son estáticas. Al conectar:

- ¿Skeleton por pantalla (como children) o un spinner genérico?
- ¿Skeleton en el hero de Hoy?
- ¿Skeleton en las tarjetas de resumen?

## 4. Onboarding / primer uso

Definido parcialmente:
- Miembro nuevo → no invitado → va a Ajustes → crea primer Hijo
- **Pendiente**: ¿hay algún nudge/banner en la pantalla Hoy si no hay Hijos?
  ¿O simplemente se ve la pantalla vacía?
- ¿Wizard de bienvenida o flujo libre?
- ¿Qué pasa si el Miembro no tiene Familia (sin Org de Clerk)?

## 5. Confirmaciones destructivas

- **Compra · Limpiar comprados**: ¿confirmación o acción directa con Deshacer?
- **Eventos · marcar hecho**: tiene undo, ¿es suficiente?
- **Pautas · finalizar**: ¿confirmación inline o dialog?

## 6. Micro-interacciones y feedback

- **Optimistic update visual**: ¿cómo se ve un ítem marcado que aún no se ha
  confirmado? (opacity, spinner, etc.)
- **Toast de éxito / Deshacer**: no hay componente de toast definido aún.
  ¿Posición? ¿Duración?
- **Reorder / drag** en compra: ¿se quiere ordenar los ítems manualmente?

## 7. Datos de mock — validar la familia tipo

Se usa como referencia:

- **Familia**: Los Martínez-Torres
- **Miembros**: Ana (admin), Carlos (member)
- **Hijos**: Mateo (5 años, 15 mar 2020), Lucía (2 años, 8 nov 2023)
- **Pautas**: Amoxicilina activa (Mateo), Vitamina D activa (Lucía), Ibuprofeno finalizada (Mateo)
- **Eventos**: Control pediatra, reunión cole, natación, trámite atrasado, vacuna completada
- **Compra**: 4 pendientes, 2 comprados

¿Coincide con lo que tenías en mente?

## 8. Responsive / breakpoints

Solo móvil para MVP. Pendiente para más adelante:
- ¿Tablet layout (sidebar nav en vez de bottom tabs)?
- ¿Desktop?
- ¿PWA install prompt?

## 9. Avatar de Hijo — color manual vs. derivado

El doc dice `avatar_color` (paleta acotada, selector de color en Ajustes).
Actualmente se deriva del nombre (hash → 6 tonos). ¿Se quiere un selector
real de color en el formulario de Ajustes, o el derivado automático es
suficiente para MVP?

## 10. Acciones "crear" desde la PWA

El doc menciona alta de Ítem, crear Evento y registrar Visita desde la PWA.
Actualmente solo hay form de alta para Compra. Pendiente:
- Formulario de Evento: ¿inline o modal?
- Formulario de Visita: ¿desde HijoDetail?
- Formulario de Medida/Talla: ¿desde HijoDetail?
