import { useState } from 'react'
import { formatAge } from './age'
import {
  useChildren,
  useCreateChild,
  useDeleteChild,
  useUpdateChild,
} from './api'
import type { Child } from './types'

/**
 * Shell SIN ESTILAR de la gestión de Hijos: cablea los hooks de datos
 * (listado, alta, edición, baja con optimistic updates) con marcado semántico
 * mínimo. Pensado para reestilar con `impeccable`; aquí solo vive la lógica.
 */
export function ChildrenPage() {
  const { data: children, isPending, isError } = useChildren()

  return (
    <main aria-labelledby="children-title">
      <h1 id="children-title">Hijos</h1>

      <NewChildForm />

      {isPending && <p>Cargando…</p>}
      {isError && <p role="alert">No se han podido cargar los Hijos.</p>}

      {children && children.length === 0 && <p>Aún no hay Hijos dados de alta.</p>}

      {children && children.length > 0 && (
        <ul>
          {children.map((child) => (
            <ChildRow key={child.id} child={child} />
          ))}
        </ul>
      )}
    </main>
  )
}

function NewChildForm() {
  const create = useCreateChild()
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !birthDate) return
    create.mutate(
      { name, birth_date: birthDate },
      {
        onSuccess: () => {
          setName('')
          setBirthDate('')
        },
      },
    )
  }

  return (
    <form onSubmit={onSubmit} aria-label="Dar de alta un Hijo">
      <label>
        Nombre
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </label>
      <label>
        Fecha de nacimiento
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={create.isPending}>
        Añadir
      </button>
      {create.isError && <span role="alert">No se pudo dar de alta.</span>}
    </form>
  )
}

function ChildRow({ child }: { child: Child }) {
  const update = useUpdateChild()
  const remove = useDeleteChild()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(child.name)
  const [birthDate, setBirthDate] = useState(child.birth_date)

  if (editing) {
    return (
      <li>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            update.mutate(
              { id: child.id, patch: { name, birth_date: birthDate } },
              { onSuccess: () => setEditing(false) },
            )
          }}
        >
          Guardar
        </button>
        <button type="button" onClick={() => setEditing(false)}>
          Cancelar
        </button>
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
