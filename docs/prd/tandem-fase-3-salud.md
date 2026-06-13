# Fase 3 — Salud

> Parte del roadmap de [Tándem](./tandem-plataforma-mvp.md). Depende de la [Fase 0 — Cimientos](./tandem-fase-0-cimientos.md). Imita el *prior art* de la [Fase 1](./tandem-fase-1-lista-compra.md).
> Vocabulario: glosario de `CONTEXT.md`. Decisiones: ADR-0002 (backend sin NLP).
> Es la fase más rica en reglas y la de mayor valor manos-libres.

## Problem Statement

Como Miembro de una familia, cuando un Hijo está enfermo y le pauta el médico un jarabe, el caos es máximo: no recuerdo el diagnóstico de la última visita, ni cada cuánto toca la dosis, ni —lo peor— si mi pareja ya se la ha dado o si me toca a mí. Llevarlo de memoria o por WhatsApp lleva a saltarse tomas o a doblarlas.

## Solution

Registro las Visitas médicas con su diagnóstico para tener el historial, e inicio Pautas dictando el tratamiento ("ibuprofeno 5 ml cada 8 horas durante 3 días"). La app calcula cuándo toca la siguiente dosis a partir de la última, y marco cada Administración (incluso por voz: "ya le he dado el jarabe"), viendo cuándo y quién dio la última para coordinarnos. La Pauta se cierra sola al cumplir su duración, o la corto antes si ya está bien.

## User Stories

1. Como Miembro, quiero registrar una Visita médica con su diagnóstico, para tener el historial de salud de mi Hijo.
2. Como Miembro, quiero consultar el historial de Visitas médicas de un Hijo, para recordar diagnósticos pasados.
3. Como Miembro, quiero iniciar una Pauta dictando medicamento, dosis, frecuencia y duración, para empezar un tratamiento sin teclear.
4. Como Miembro, quiero ver las Pautas activas de cada Hijo, para saber qué tratamientos están en curso.
5. Como Miembro, quiero ver cuándo toca la siguiente dosis de una Pauta, para no adelantarme ni retrasarme.
6. Como Miembro, quiero marcar que he dado una dosis (registrar una Administración), para que el cálculo de la siguiente se actualice.
7. Como Miembro, quiero dictar "ya le he dado el jarabe", para registrar la Administración con las manos ocupadas.
8. Como Miembro, quiero que el sistema evite registrar dos veces la misma toma seguida, para no creer que ha tomado doble dosis ni falsear la siguiente.
9. Como Miembro, quiero ver cuándo y quién dio la última dosis, para coordinarme con el otro Miembro y no duplicar.
10. Como Miembro, quiero que una Pauta finalice automáticamente al cumplirse su duración, para que no quede activa indefinidamente.
11. Como Miembro, quiero finalizar una Pauta antes de tiempo (manual o dictada), para cortar el tratamiento si el Hijo ya está bien.
12. Como Miembro, quiero corregir o borrar una Administración registrada por error, para que la siguiente toma vuelva a calcularse bien.
13. Como Miembro, quiero registrar una Visita médica también desde la PWA, para apuntar con calma tras la consulta.
14. Como Miembro, quiero que una Visita médica (pasado) y una cita futura (agenda) sean cosas distintas, para no confundir historial con planificación.
15. Como Miembro, quiero ver en el dashboard la próxima toma pendiente de hoy, para no saltármela.

## Implementation Decisions

### Módulos
- Backend: módulo de salud en REST + herramientas MCP (alta y cambios de estado clínicos). Reutiliza Familia/RLS (Fase 0) y patrones (Fase 1).
- Frontend: página "Salud" (Pautas activas + historial de Visitas, por Hijo) + widget de próxima toma en el dashboard.

### Esquema
- `health_visits`: `id`, `family_id`, `child_id`, `visited_at`, `diagnosis`, metadatos médicos variables en columna **JSONB** (`notes`/`treatment`).
- `pautas`: `id`, `family_id`, `child_id`, `medication`, `dose`, `interval` (tiempo entre tomas), `duration`/`ends_at`, `status` (`active` | `finished`), `health_visit_id` (opcional), `created_by`.
- `administrations`: `id`, `family_id`, `pauta_id`, `administered_at`, `administered_by`.

### Contratos
- **REST**: CRUD/listado de Visitas; listar Pautas (activas/finalizadas) por Hijo; iniciar Pauta; finalizar Pauta; registrar/corregir/borrar Administración; obtener "siguiente toma" calculada. Acotado a la Familia.
- **MCP**:
  - `record_health_visit(child_name, visited_at, diagnosis, notes?)`
  - `start_pauta(child_name, medication, dose, interval, duration)`
  - `record_administration(pauta_id)` — con **guarda de duplicado**.
  - `finish_pauta(pauta_id)`
  - `list_active_pautas(child_name?)` — lectura mínima para que Claude elija la Pauta correcta antes de registrar/finalizar.
  - `child_name` por matching estricto (contrato Fase 0).

### Reglas
- **Visita ≠ Pauta**: la Visita es histórica (con diagnóstico); la Pauta es tratamiento activo. Una Visita puede originar una o varias Pautas (enlace opcional).
- **Siguiente toma** = última Administración + `interval`. No se pre-generan horarios.
- **Finalización**: automática al cumplir `duration` (calcular `ends_at`), y manual/dictada anticipada.
- **Guarda de duplicado (no idempotencia global)**: si llega otra Administración de la misma Pauta dentro de una **ventana corta**, se ignora y se devuelve la existente. Protege el cálculo de la siguiente toma y evita doble dosis aparente.
- **Atribución**: cada Administración guarda cuándo y **quién** (Miembro del token MCP o del JWT).
- **Correcciones**: editar/borrar Administraciones y Visitas desde la PWA; al borrar una Administración, recalcular la siguiente toma.
- **Independiente de la Agenda (Fase 4)**: una cita futura es un Evento, no una Visita; sin conversión automática.

### Frontend
- Tarjeta de Pauta activa con "siguiente toma", botón de marcar dosis (optimistic + deshacer), y "última: cuándo / quién".
- Historial de Visitas consultable por Hijo.

## Testing Decisions

- Postgres real (clave para JSONB de Visitas); comportamiento externo, no internals.
- **Costura HTTP/REST**: iniciar Pauta y verificar cálculo de siguiente toma tras registrar Administraciones; finalización automática por duración y manual; corrección de Administración recalcula la siguiente; CRUD de Visitas con JSONB.
- **Costura MCP**: `start_pauta`, `record_administration` (incluida la **guarda de duplicado** dentro de la ventana), `finish_pauta`, `record_health_visit`, `list_active_pautas`; matching estricto de Hijo; aislamiento por Familia.
- **Costura de ruta/página (frontend)**: con MSW, marcar dosis con optimistic update, ver "siguiente toma" y "última: quién/cuándo", deshacer.
- Prior art: costuras de la Fase 1.

## Out of Scope

- Notificaciones/recordatorios push de tomas (la consulta es pull; v1 sin push).
- Horarios fijos de toma o pre-generación de huecos (la frecuencia es por intervalo desde la última toma).
- Idempotencia global por clave (se usa guarda de dominio en Administración).
- Conversión/enlace automático entre cita (Evento, Fase 4) y Visita médica.
- Curvas/percentiles o integración con datos clínicos externos.

## Further Notes

- ADR-0002 es especialmente relevante aquí: la extracción de `interval`/`duration`/`dose` desde el dictado la hace Claude vía esquemas; el backend solo valida y persiste. Merece esquemas de herramienta muy claros y ejemplos.
- La ventana de la guarda de duplicado debe ser un parámetro razonado (suficiente para cubrir reintentos/repeticiones inmediatas, sin bloquear una toma adelantada legítima).
