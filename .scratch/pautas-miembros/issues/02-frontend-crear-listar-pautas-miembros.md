# 02 — Frontend: crear y listar Pautas de Miembros

Status: ready-for-agent

## What to build

Slice UI que permite crear una Pauta para un Miembro adulto y verla en la lista de PautasPage, con la misma UX que las de Hijos (tarjeta con nombre del sujeto, marcar toma, finalizar).

Alcance:

- **Hook `useMembers()`**: nuevo hook (o extensión de API existente) que devuelve los Miembros de la Familia actual (id + display_name). El backend ya expone el contexto necesario vía Clerk.
- **PautaForm — selector unificado de sujeto**: un único campo `<select>` (o equivalente accesible) con dos `<optgroup>`: "Hijos" (children) y "Miembros" (members). Al seleccionar un Miembro, se oculta el campo `health_visit_id` (no aplica). El campo se etiqueta "Para quién".
- **PautaCard — prop `subjectName`**: renombrar prop `childName` → `subjectName`. La lógica de monograma (`initialOf`, `toneOf`) opera igual con el display_name del Miembro. `showChild` → `showSubject` (naming).
- **PautasPage — resolución de nombre**: la API devuelve `subject_name` en `PautaOut`; usarlo directamente en vez de resolver por `child_id` contra la lista de children local. Simplifica el código (elimina `childNameById`).
- **Tipos frontend**: `Pauta` type añade `member_id?: string` + `subject_name: string`.

## Acceptance criteria

- [ ] El formulario muestra un selector con grupos "Hijos" y "Miembros"; todos los miembros de la Familia aparecen.
- [ ] Al seleccionar un Miembro, el campo "Visita médica" desaparece.
- [ ] Crear una Pauta para un Miembro envía `member_id` (sin `child_id`) al backend; la pauta aparece en la lista.
- [ ] La PautaCard muestra el display_name del Miembro con monograma, igual que un Hijo.
- [ ] Marcar toma y Finalizar Pauta funcionan igual para pautas de Miembros.
- [ ] Las pautas se ordenan por urgencia (next_dose_at) independientemente del tipo de sujeto.
- [ ] TDD: tests primero. `pnpm test:frontend`, `pnpm lint`, `pnpm -C frontend exec tsc -b` pasan.

## Blocked by

- 01-schema-api-pauta-acepta-miembro
