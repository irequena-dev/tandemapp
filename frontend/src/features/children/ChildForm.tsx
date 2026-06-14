import { type FormEvent, useState } from 'react'
import type { ChildInput } from './types'

type ChildFormProps = {
  /** Texto del botón de envío (p. ej. "Añadir" o "Guardar"). */
  submitLabel: string
  pending?: boolean
  hasError?: boolean
  initialName?: string
  initialBirthDate?: string
  onSubmit: (input: ChildInput) => void
  /** Si se pasa, muestra un botón de cancelar (modo edición). */
  onCancel?: () => void
}

/**
 * Formulario controlado y reutilizable para el alta y la edición de un Hijo.
 *
 * Es PRESENTACIONAL: no conoce mutaciones ni caché; solo gestiona el estado de
 * sus inputs y avisa al contenedor con `onSubmit`. Pensado para reestilar.
 */
export function ChildForm({
  submitLabel,
  pending = false,
  hasError = false,
  initialName = '',
  initialBirthDate = '',
  onSubmit,
  onCancel,
}: ChildFormProps) {
  const [name, setName] = useState(initialName)
  const [birthDate, setBirthDate] = useState(initialBirthDate)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!name || !birthDate) return
    onSubmit({ name, birth_date: birthDate })
  }

  return (
    <form onSubmit={handleSubmit} aria-label="Datos del Hijo">
      <label>
        Nombre
        <input value={name} onChange={(e) => setName(e.target.value)} required />
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
      <button type="submit" disabled={pending}>
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      )}
      {hasError && <span role="alert">No se pudo guardar.</span>}
    </form>
  )
}
