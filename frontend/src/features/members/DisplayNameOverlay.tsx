import { type FormEvent, useEffect, useState } from 'react'
import { useUpdateDisplayName } from './api'
import './display-name-overlay.css'

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

interface DisplayNameOverlayProps {
  onClose: () => void
}

export function DisplayNameOverlay({ onClose }: DisplayNameOverlayProps) {
  const [displayName, setDisplayName] = useState('')
  const updateDisplayName = useUpdateDisplayName()

  // Auto-focus on mount
  useEffect(() => {
    const input = document.getElementById('display-name-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.select()
    }
  }, [])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = displayName.trim()
    if (!trimmed) return

    updateDisplayName.mutate(
      { display_name: trimmed },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  return (
    <>
      <div className="display-name-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="display-name-overlay" role="dialog" aria-label="Configurar tu nombre" aria-modal="true">
        <div className="display-name-overlay__header">
          <h2 className="display-name-overlay__title">¡Bienvenido a Tándem!</h2>
          <button type="button" className="display-name-overlay__close" aria-label="Cerrar" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="display-name-overlay__content">
          <p className="display-name-overlay__desc">
            Para personalizar tu experiencia, dinos cómo quieres que te llamemos en la app.
          </p>

          <form className="display-name-form" onSubmit={handleSubmit}>
            <label htmlFor="display-name-input" className="display-name-form__label">
              Tu nombre
            </label>
            <input
              id="display-name-input"
              type="text"
              className="display-name-form__input"
              placeholder="Ej: María, Carlos, etc."
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              maxLength={50}
            />

            <div className="display-name-form__actions">
              <button
                type="submit"
                className="btn btn--primary"
                disabled={updateDisplayName.isPending}
              >
                {updateDisplayName.isPending ? 'Guardando…' : 'Continuar'}
              </button>
              <button type="button" className="btn btn--secondary" onClick={onClose}>
                Ahora no
              </button>
            </div>

            {updateDisplayName.isError && (
              <p className="display-name-form__error">
                No se pudo guardar tu nombre. Inténtalo de nuevo.
              </p>
            )}
          </form>
        </div>
      </div>
    </>
  )
}
