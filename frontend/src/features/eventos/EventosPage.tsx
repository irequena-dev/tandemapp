import { useState } from 'react'
import { useChildren } from '../children/api'
import { useEventTypes } from './event-types-api'
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent, useDoneEvent, useUndoEvent } from './events-api'
import { EventTypesManager } from './EventTypesManager'
import type { EventOut, EventTypeOut } from './types'
import './eventos.css'

/* ---------- Icons ---------- */

function eventIcon(iconName: string) {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (iconName) {
    case 'stethoscope':
      return <svg {...props}><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" /><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4" /><circle cx="20" cy="10" r="2" /></svg>
    case 'school':
      return <svg {...props}><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
    case 'activity':
      return <svg {...props}><path d="M3 12h4l2 5 4-12 2 7h6" /></svg>
    case 'file':
      return <svg {...props}><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /></svg>
    default:
      return <svg {...props}><circle cx="12" cy="12" r="10" /></svg>
  }
}

function CheckSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ClockSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function AlertSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function formatTime(t: string): string {
  return t.slice(0, 5)
}

function statusVisual(ev: EventOut) {
  if (ev.status === 'done') {
    return <span className="evento-pill evento-pill--done"><CheckSmall /> Hecho</span>
  }
  if (ev.is_overdue) {
    return <span className="evento-pill evento-pill--overdue"><AlertSmall /> Atrasado</span>
  }
  return <span className="evento-pill evento-pill--pending"><ClockSmall /> Pendiente</span>
}

/* ---------- Event form ---------- */

type EventFormProps = {
  types: EventTypeOut[]
  children: { id: string; name: string }[]
  initial?: { title: string; date: string; time: string; event_type_id: string; child_id: string }
  onSubmit: (data: { title: string; date: string; time: string | null; event_type_id: string; child_id: string | null }) => void
  onCancel: () => void
  submitLabel: string
}

function EventForm({ types, children, initial, onSubmit, onCancel, submitLabel }: EventFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [date, setDate] = useState(initial?.date ?? '')
  const [time, setTime] = useState(initial?.time ?? '')
  const [typeId, setTypeId] = useState(initial?.event_type_id ?? (types[0]?.id ?? ''))
  const [childId, setChildId] = useState(initial?.child_id ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date || !typeId) return
    onSubmit({
      title: title.trim(),
      date,
      time: time || null,
      event_type_id: typeId,
      child_id: childId || null,
    })
  }

  return (
    <form className="evento-form" onSubmit={handleSubmit}>
      <input
        className="evento-form__input"
        type="text"
        placeholder="Título del evento…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        autoFocus
      />
      <div className="evento-form__row">
        <input className="evento-form__input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <input className="evento-form__input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="evento-form__row">
        <select className="evento-form__input" value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="evento-form__input" value={childId} onChange={(e) => setChildId(e.target.value)}>
          <option value="">Sin Hijo</option>
          {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="evento-form__actions">
        <button type="submit" className="btn btn--primary btn--sm">{submitLabel}</button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  )
}

/* ---------- Main ---------- */

export function EventosPage() {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [childFilter, setChildFilter] = useState<string | null>(null)
  const [showTypes, setShowTypes] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const { data: eventTypes } = useEventTypes()
  const { data: childrenData } = useChildren()
  const { data: events } = useEvents()
  const createMut = useCreateEvent()
  const updateMut = useUpdateEvent()
  const deleteMut = useDeleteEvent()
  const doneMut = useDoneEvent()
  const undoMut = useUndoEvent()

  const types = eventTypes ?? []
  const kids = childrenData ?? []
  const allEvents = events ?? []

  const filtered = allEvents
    .filter((e) => !typeFilter || e.event_type_id === typeFilter)
    .filter((e) => !childFilter || e.child_id === childFilter)
    .sort((a, b) => a.date.localeCompare(b.date))

  const handleCreate = (data: { title: string; date: string; time: string | null; event_type_id: string; child_id: string | null }) => {
    createMut.mutate(data)
    setShowCreate(false)
  }

  const handleUpdate = (id: string, data: { title: string; date: string; time: string | null; event_type_id: string; child_id: string | null }) => {
    updateMut.mutate({ id, patch: data })
    setEditingId(null)
  }

  const editingEvent = editingId ? allEvents.find((e) => e.id === editingId) : null

  return (
    <div className="eventos" aria-labelledby="eventos-title">
      <div className="eventos__head">
        <h1 className="eventos__title" id="eventos-title">Eventos</h1>
        <div className="eventos__head-actions">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setShowTypes((v) => !v)}
          >
            {showTypes ? 'Cerrar tipos' : 'Gestionar tipos'}
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => { setShowCreate((v) => !v); setEditingId(null) }}
          >
            {showCreate ? 'Cancelar' : 'Crear Evento'}
          </button>
        </div>
      </div>

      {showTypes && <EventTypesManager />}

      {showCreate && (
        <EventForm
          types={types}
          children={kids}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          submitLabel="Crear"
        />
      )}

      {editingEvent && (
        <EventForm
          types={types}
          children={kids}
          initial={{
            title: editingEvent.title,
            date: editingEvent.date,
            time: editingEvent.time ? formatTime(editingEvent.time) : '',
            event_type_id: editingEvent.event_type_id,
            child_id: editingEvent.child_id ?? '',
          }}
          onSubmit={(data) => handleUpdate(editingEvent.id, data)}
          onCancel={() => setEditingId(null)}
          submitLabel="Guardar"
        />
      )}

      <div className="eventos__filters" role="group" aria-label="Filtros">
        <button
          type="button"
          className={`eventos__filter${!typeFilter && !childFilter ? ' eventos__filter--active' : ''}`}
          onClick={() => { setTypeFilter(null); setChildFilter(null) }}
        >
          Todos
        </button>
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`eventos__filter${typeFilter === t.id ? ' eventos__filter--active' : ''}`}
            onClick={() => setTypeFilter(typeFilter === t.id ? null : t.id)}
          >
            {t.name}
          </button>
        ))}
        {kids.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`eventos__filter${childFilter === c.id ? ' eventos__filter--active' : ''}`}
            onClick={() => setChildFilter(childFilter === c.id ? null : c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="eventos__empty">
          <span className="eventos__empty-icon" aria-hidden="true"><CalendarIcon /></span>
          <p className="eventos__empty-title">Sin eventos próximos</p>
          <p className="eventos__empty-text">
            Crea un evento o díctalo por voz. Las citas, cole y trámites aparecerán aquí.
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <ul className="eventos__list">
          {filtered.map((ev) => (
            <li className="evento-item" key={ev.id}>
              <span className="evento-item__icon">{eventIcon(ev.event_type?.icon ?? 'circle')}</span>
              <div className="evento-item__body">
                <span className="evento-item__title">{ev.title}</span>
                <span className="evento-item__meta">
                  {formatDate(ev.date)}
                  {ev.time && ` · ${formatTime(ev.time)}`}
                  {ev.event_type && ` · ${ev.event_type.name}`}
                  {ev.child && ` · ${ev.child.name}`}
                </span>
              </div>
              <div className="evento-item__actions">
                {statusVisual(ev)}
                {ev.status === 'done' ? (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Deshacer ${ev.title}`}
                    title="Deshacer"
                    onClick={() => undoMut.mutate(ev.id)}
                  >
                    <XIcon />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Marcar ${ev.title} como hecho`}
                    title="Marcar hecho"
                    onClick={() => doneMut.mutate(ev.id)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Editar ${ev.title}`}
                  title="Editar"
                  onClick={() => { setEditingId(ev.id); setShowCreate(false) }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Borrar ${ev.title}`}
                  title="Borrar"
                  onClick={() => deleteMut.mutate(ev.id)}
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
