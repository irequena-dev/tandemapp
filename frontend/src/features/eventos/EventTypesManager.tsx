import { useState } from 'react'
import {
  useCreateEventType,
  useDeleteEventType,
  useEventTypes,
  useUpdateEventType,
} from './event-types-api'
import type { EventTypeOut } from './types'

/* ---------- Inline icons ---------- */

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

/* ---------- Component ---------- */

export function EventTypesManager() {
  const { data: types, isLoading } = useEventTypes()
  const createMut = useCreateEventType()
  const updateMut = useUpdateEventType()
  const deleteMut = useDeleteEventType()

  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const handleCreate = () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    createMut.mutate({ name: trimmed })
    setNewName('')
    setShowAdd(false)
  }

  const startEdit = (t: EventTypeOut) => {
    setEditingId(t.id)
    setEditName(t.name)
  }

  const handleUpdate = () => {
    const trimmed = editName.trim()
    if (!editingId || !trimmed) return
    updateMut.mutate({ id: editingId, patch: { name: trimmed } })
    setEditingId(null)
    setEditName('')
  }

  const handleDelete = (id: string) => {
    deleteMut.mutate(id)
  }

  if (isLoading) return null

  const systemTypes = (types ?? []).filter((t) => t.is_system)
  const customTypes = (types ?? []).filter((t) => !t.is_system)

  return (
    <section className="et-manager" aria-labelledby="et-manager-title">
      <div className="et-manager__head">
        <h2 className="et-manager__title" id="et-manager-title">Tipos de Evento</h2>
        <button
          type="button"
          className="icon-btn icon-btn--primary"
          aria-label="Añadir tipo de evento"
          onClick={() => setShowAdd((v) => !v)}
        >
          <PlusIcon />
        </button>
      </div>

      {showAdd && (
        <form
          className="et-manager__add-form"
          onSubmit={(e) => { e.preventDefault(); handleCreate() }}
        >
          <input
            className="et-manager__input"
            type="text"
            placeholder="Nombre del tipo…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="icon-btn icon-btn--primary" aria-label="Guardar tipo">
            <CheckIcon />
          </button>
          <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setShowAdd(false)}>
            <XIcon />
          </button>
        </form>
      )}

      <ul className="et-manager__list">
        {systemTypes.map((t) => (
          <li key={t.id} className="et-manager__item">
            <span className="et-manager__item-name">{t.name}</span>
            <span className="et-manager__badge">Base</span>
          </li>
        ))}

        {customTypes.map((t) => (
          <li key={t.id} className="et-manager__item">
            {editingId === t.id ? (
              <form
                className="et-manager__edit-form"
                onSubmit={(e) => { e.preventDefault(); handleUpdate() }}
              >
                <input
                  className="et-manager__input"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <button type="submit" className="icon-btn icon-btn--primary" aria-label="Guardar">
                  <CheckIcon />
                </button>
                <button type="button" className="icon-btn" aria-label="Cancelar" onClick={() => setEditingId(null)}>
                  <XIcon />
                </button>
              </form>
            ) : (
              <>
                <span className="et-manager__item-name">{t.name}</span>
                <div className="et-manager__item-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Editar ${t.name}`}
                    onClick={() => startEdit(t)}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`Borrar ${t.name}`}
                    onClick={() => handleDelete(t.id)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {!systemTypes.length && !customTypes.length && (
        <div className="et-manager__empty">
          <span className="et-manager__empty-icon"><TagIcon /></span>
          <p>No hay tipos de evento.</p>
        </div>
      )}
    </section>
  )
}
