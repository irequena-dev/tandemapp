import { type FormEvent, useId, useState } from 'react'
import { DateField } from './DateField'
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

/** Fecha de hoy en formato ISO `yyyy-mm-dd`, para acotar el selector. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Formulario controlado y reutilizable para el alta y la edición de un Hijo.
 *
 * Es PRESENTACIONAL: no conoce mutaciones ni caché; solo gestiona el estado de
 * sus inputs y avisa al contenedor con `onSubmit`. La validación es local y
 * amable: corrige, nunca regaña.
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
  const [showErrors, setShowErrors] = useState(false)

  const nameId = useId()
  const dateId = useId()
  const today = todayISO()

  const trimmedName = name.trim()
  const nameError = !trimmedName ? 'El nombre es obligatorio.' : null
  const dateError = !birthDate
    ? 'La fecha de nacimiento es obligatoria.'
    : birthDate > today
      ? 'La fecha de nacimiento no puede ser futura.'
      : null

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (nameError || dateError) {
      setShowErrors(true)
      return
    }
    onSubmit({ name: trimmedName, birth_date: birthDate })
  }

  const showName = showErrors && nameError
  const showDate = showErrors && dateError

  return (
    <form className="hijo-form" onSubmit={handleSubmit} noValidate aria-label="Datos del Hijo">
      <div className="hijo-form__fields">
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Nombre
          </label>
          <input
            id={nameId}
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoFocus
            placeholder="p. ej. Mara"
            aria-invalid={showName ? true : undefined}
            aria-describedby={showName ? `${nameId}-err` : undefined}
          />
          {showName && (
            <span className="field__error" id={`${nameId}-err`} role="alert">
              {nameError}
            </span>
          )}
        </div>

        <div className="field">
          <label className="field__label" htmlFor={dateId}>
            Fecha de nacimiento
          </label>
          <DateField
            id={dateId}
            value={birthDate}
            max={today}
            onChange={setBirthDate}
            invalid={!!showDate}
            describedBy={showDate ? `${dateId}-err` : undefined}
          />
          {showDate && (
            <span className="field__error" id={`${dateId}-err`} role="alert">
              {dateError}
            </span>
          )}
        </div>
      </div>

      <div className="hijo-form__actions">
        <button type="submit" className="btn btn--primary" disabled={pending}>
          {pending && <span className="spinner" aria-hidden="true" />}
          {pending ? 'Guardando…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn btn--secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
      </div>

      {hasError && (
        <span className="hijo-form__status" role="alert">
          No se pudo guardar. Inténtalo de nuevo.
        </span>
      )}
    </form>
  )
}
