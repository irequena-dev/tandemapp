# Fase 4 — Agenda

> Parte del roadmap de [CaosCero](./caoscero-plataforma-mvp.md). Depende de la [Fase 0 — Cimientos](./caoscero-fase-0-cimientos.md). Imita el *prior art* de la [Fase 1](./caoscero-fase-1-lista-compra.md).
> Vocabulario: glosario de `CONTEXT.md`. Decisiones de calado: ADR-0003 (Eventos recurrentes materializados), ADR-0002 (backend sin NLP).

## Problem Statement

Como Miembro de una familia, la vida se llena de fechas que no puedo olvidar: la cita del pediatra, cuándo toca la vacuna, la excursión del cole, hacer la matrícula antes de tal día, el extraescolar de los martes. Lo llevo en la cabeza o en notas dispersas, y entre varios se nos cuela algo cada poco.

## Solution

Una agenda por Familia donde apunto Eventos: cosas que ocurren o vencen en una fecha, con hora opcional, opcionalmente ligadas a un Hijo. Creo Eventos sueltos dictándolos a Claude ("cita del pediatra el martes a las 10") y los clasifico por tipo (médico, cole, extraescolar, trámite, otros), pudiendo añadir tipos propios en la PWA. Para lo recurrente (extraescolar) creo en la PWA una Serie acotada que genera cada ocurrencia como un Evento independiente. Veo los próximos al abrir la app y marco a mano lo que realmente ocurrió.

## User Stories

1. Como Miembro, quiero crear un Evento dictando título y fecha ("cita del pediatra el martes a las 10"), para apuntarlo sin teclear.
2. Como Miembro, quiero asociar opcionalmente un Evento a un Hijo, para distinguir "cita de Lucas" de un evento familiar.
3. Como Miembro, quiero crear Eventos con hora o de día completo, para cubrir una cita a una hora o una excursión de día.
4. Como Miembro, quiero apuntar como Evento un trámite con fecha ("hacer la matrícula antes del 30"), para no olvidarlo aunque no ocurra a una hora.
5. Como Miembro, quiero clasificar un Evento por tipo (médico, cole, extraescolar, trámite, otros), para filtrar la agenda.
6. Como Miembro, quiero añadir tipos de Evento propios de mi Familia desde la PWA, para adaptarlos a nuestra vida.
7. Como Miembro, quiero que al dictar, si ningún tipo encaja, se use "otros", para que el dictado nunca se atasque por la categoría.
8. Como Miembro, quiero ver la agenda de próximos Eventos al abrir la app, para anticiparme.
9. Como Miembro, quiero filtrar la agenda por tipo y/o por Hijo, para centrarme en lo que busco.
10. Como Miembro, quiero marcar un Evento como hecho manualmente, para distinguir lo que ocurrió de lo que se olvidó.
11. Como Miembro, quiero que un Evento pasado y sin marcar aparezca como pendiente/atrasado, para no perder de vista lo que falló.
12. Como Miembro, quiero crear desde la PWA una Serie recurrente acotada ("extraescolar los martes hasta junio"), para no apuntar cada semana a mano.
13. Como Miembro, quiero que cada repetición de una Serie sea un Evento independiente, para marcar o cancelar "solo esta vez" sin afectar al resto.
14. Como Miembro, quiero borrar de golpe las ocurrencias futuras de una Serie, para cancelar una actividad que ya no seguimos.
15. Como Miembro, quiero editar o borrar un Evento suelto desde la PWA, para corregir un dictado o un cambio de planes.
16. Como Miembro, quiero ver las horas y los "hoy" en la zona horaria de mi dispositivo, para que la agenda cuadre con mi reloj.
17. Como Miembro, quiero ver en el dashboard los Eventos de hoy, para empezar el día con la foto completa.

## Implementation Decisions

### Módulos
- Backend: módulo de agenda en REST + herramientas MCP de alta (Eventos sueltos) y lectura mínima de tipos. Reutiliza Familia/RLS (Fase 0) y patrones (Fase 1).
- Frontend: página "Agenda" (lista de próximos + filtros), gestión de Tipos de Evento y creación de Series en Ajustes/Agenda, y widget de "hoy" en el dashboard.

### Esquema
- `events`: `id`, `family_id`, `child_id` (nullable, 0 o 1), `title`, `event_type_id`, `date`, `time` (nullable → día completo), `status` (`pending` | `done`), `series_id` (nullable), `created_by`.
- `event_types`: `id`, `family_id` (nullable para los base sembrados por el sistema), `name`. Lista gestionada por Familia (base + personalizados), incluye "otros".
- `series`: `id`, `family_id`, definición de la regla **acotada** (cadencia + `ends_at`/`max_count`).

### Contratos
- **REST**: listar agenda (próximos, con filtros por tipo/Hijo); crear/editar/borrar Evento; marcar hecho/deshacer; CRUD de Tipos de Evento; crear Serie (materializa ocurrencias); borrar ocurrencias futuras de una Serie. Acotado a la Familia.
- **MCP**:
  - `create_event(title, date, time?, type, child_name?)` — solo **Eventos sueltos** (sin recurrencia por voz).
  - `list_event_types()` — lectura mínima para que la IA elija un tipo válido.
  - `child_name` por matching estricto (contrato Fase 0).

### Reglas
- **Evento** concepto único y flexible (cubre cita/excursión/trámite). 0 o 1 Hijo. Fecha + hora opcional (sin hora = día completo).
- **Estado `done` solo manual**; pasar la fecha/hora no completa nada. Un Evento pasado sin marcar = pendiente/atrasado.
- **Independiente de Visita médica** (Fase 3); sin conversión automática.
- **Tipo de Evento**: enum gestionado por Familia (base + personalizados creados en PWA). La IA elige entre los existentes; si ninguno encaja, **"otros"**. La IA no crea tipos.
- **Serie (ADR-0003)**: acotada; **materializa** todas las ocurrencias como Eventos al crearse; es **solo generador** (sin edición en cascada); recalendarizar = borrar futuras + crear otra Serie. **Se crean solo en la PWA**.
- **Zona horaria del dispositivo** para mostrar/agrupar; timestamps en UTC.

### Frontend
- Agenda como lista de próximos con estado (pendiente/hecho/atrasado), filtros por tipo y Hijo.
- Alta de Serie con regla acotada y previsualización de ocurrencias generadas; acción "borrar futuras de esta serie".

## Testing Decisions

- Postgres real; comportamiento externo, no internals.
- **Costura HTTP/REST**: crear Eventos con/sin hora y con/sin Hijo; marcar hecho/deshacer; que un Evento pasado sin marcar se reporte como atrasado; CRUD de Tipos de Evento; crear Serie y verificar que **materializa el número correcto de ocurrencias** acotadas; borrar futuras de una Serie sin tocar las ya marcadas/pasadas.
- **Costura MCP**: `create_event` (incluido fallback a "otros" cuando el tipo no encaja, y rechazo de recurrencia por voz), `list_event_types`, matching estricto de Hijo; aislamiento por Familia.
- **Costura de ruta/página (frontend)**: con MSW, crear Evento, marcar hecho con optimistic update, filtrar, y crear una Serie viendo las ocurrencias materializadas.
- Prior art: costuras de la Fase 1.

## Out of Scope

- Notificaciones/recordatorios push o email (agenda solo de consulta/pull en v1).
- Recurrencia avanzada: patrones complejos, Series indefinidas, edición en cascada de Series, excepciones por ocurrencia más allá de editar/borrar la ocurrencia suelta.
- Creación de Series o de Tipos de Evento por voz (solo PWA).
- Conversión/enlace automático entre cita (Evento) y Visita médica (Fase 3).
- Eventos con hora de fin, duración o multi-día (campamento): se apuntan como Evento de inicio.

## Further Notes

- La regla "Series acotadas + materialización" (ADR-0003) es lo que mantiene simple esta fase: sin cron de generación y con "solo esta ocurrencia" trivial.
- El dashboard de "hoy" combina Eventos con la próxima toma (Fase 3) si ambas fases están implementadas.
