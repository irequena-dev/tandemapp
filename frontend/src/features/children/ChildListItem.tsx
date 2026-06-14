import { useState } from 'react'
import { formatAge } from './age'
import { useDeleteChild, useUpdateChild } from './api'
import { ChildForm } from './ChildForm'
import type { Child } from './types'

/**
 * Una fila de la lista de Hijos: vista de lectura (nombre + edad derivada) con
 * acciones de editar/eliminar, y modo edición que reutiliza `ChildForm`.
 *
 * Aquí vive el estado de UI local (editando o no) y las mutaciones de la fila;
 * el marcado es lo que reestiliza impeccable.
 */
export function ChildListItem({ child }: { child: Child }) {
  const update = useUpdateChild()
  const remove = useDeleteChild()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li>
        <ChildForm
          submitLabel="Guardar"
          pending={update.isPending}
          hasError={update.isError}
          initialName={child.name}
          initialBirthDate={child.birth_date}
          onSubmit={(patch) =>
            update.mutate(
              { id: child.id, patch },
              { onSuccess: () => setEditing(false) },
            )
          }
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li>
      <span>{child.name}</span>
      {' — '}
      <span>{formatAge(child.birth_date)}</span>
      <button type="button" onClick={() => setEditing(true)}>
        Editar
      </button>
      <button
        type="button"
        onClick={() => remove.mutate(child.id)}
        disabled={remove.isPending}
      >
        Eliminar
      </button>
    </li>
  )
}
