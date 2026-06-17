## Parent

`docs/prd/tandem-fase-4-agenda.md`

## What to build

El aporte de la Fase 4 a la pantalla **Hoy**: los **Eventos de hoy** en el **timeline** y la tarjeta **"Próxima cita"** (próximo Evento de tipo **Médico**) en "Más cosas".

Extiende `GET /api/today` (creado en `tandem-ia-pantallas/01`):
- **Timeline**: añade los Eventos de hoy (`type=event`), combinándose cronológicamente con las tomas de la Fase 3 si existe.
- **Héroe "Ahora"**: si no hay toma pendiente (prioridad de Fase 3), el Evento más inminente de hoy puede ocupar el héroe con acción "Marcar hecho".
- **Summary**: `next_medical_event` = próximo Evento de tipo Médico; la tarjeta navega a Eventos. (Es un Evento, no una Visita médica.)

La zona horaria del **dispositivo** define qué es "hoy"; timestamps en UTC.

## Acceptance criteria

- [ ] `GET /api/today` incluye los Eventos de hoy en `timeline` (`type=event`) ordenados cronológicamente.
- [ ] `summary.next_medical_event` devuelve el próximo Evento de tipo Médico (o `null`); la tarjeta "Próxima cita" navega a Eventos.
- [ ] Cuando no hay toma pendiente, el Evento más inminente de hoy puede ocupar el héroe con acción "Marcar hecho" (respetando la prioridad de la toma de Fase 3 cuando exista).
- [ ] El agrupado por "hoy" usa la zona horaria del dispositivo.
- [ ] Cubierto por la costura HTTP/REST (`/api/today` con Eventos) y la costura de ruta/página con MSW.

## Blocked by

- 02-eventos-sueltos.md
- `docs/issues/tandem-ia-pantallas/01-hoy-endpoint-agregado-estado-calmado.md`
