# 03 — Hoy: pautas de adulto en el dashboard

Status: ready-for-agent

## What to build

El dashboard Hoy muestra la hero section con la siguiente dosis más urgente y las pautas activas del día. Tras este slice, las pautas de Miembros aparecen mezcladas con las de Hijos, ordenadas por urgencia, usando `subject_name` para identificar al sujeto.

Alcance:

- **Hero section**: la lógica que selecciona "la siguiente dosis" ya no filtra solo pautas con `child_id`; toma la pauta con `next_dose_at` más cercano independientemente del tipo de sujeto. Si el hero ya usa el campo `subject_name` (introducido en slice 01), no requiere cambios.
- **Lista de pautas del día**: las cards de Hoy muestran pautas de Miembros con la misma card que las de Hijos (PautaCard con `subjectName`). Si Hoy ya reutiliza PautaCard del slice 02, verificar que pasa `subject_name` correctamente.
- **Verificar que no hay filtros residuales**: asegurar que queries/hooks del dashboard no filtran por `child_id IS NOT NULL` ni por presencia de children.

## Acceptance criteria

- [ ] Una Pauta activa de un Miembro con `next_dose_at` más cercano aparece en la hero section.
- [ ] Las pautas de Miembros y Hijos se muestran mezcladas en la lista del día, ordenadas por urgencia.
- [ ] El nombre del sujeto adulto se muestra correctamente en la card de Hoy.
- [ ] Marcar toma desde la card de Hoy funciona para pautas de Miembros.
- [ ] Si no hay pautas activas (ni de Hijos ni de Miembros), el empty state sigue funcionando.
- [ ] TDD: tests primero. `pnpm test:frontend`, `pnpm lint`, `pnpm -C frontend exec tsc -b` pasan.

## Blocked by

- 02-frontend-crear-listar-pautas-miembros
