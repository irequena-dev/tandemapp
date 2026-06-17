import { useState } from 'react'
import {
  CHILDREN,
  EVENTS,
  childById,
  type MockEvent,
} from '../../lib/mock-data'
import { useEventTypes } from './event-types-api'
import { EventTypesManager } from './EventTypesManager'
import type { EventTypeOut } from './types'
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

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

function statusPill(status: MockEvent['status']) {
  switch (status) {
    case 'done':
      return <span className="evento-pill evento-pill--done"><CheckSmall /> Hecho</span>
    case 'overdue':
      return <span className="evento-pill evento-pill--overdue"><AlertSmall /> Atrasado</span>
    default:
      return <span className="evento-pill evento-pill--pending"><ClockSmall /> Pendiente</span>
  }
}

function eventTypeById(types: EventTypeOut[], id: string): EventTypeOut | undefined {
  return types.find((t) => t.id === id)
}

export function EventosPage() {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [childFilter, setChildFilter] = useState<string | null>(null)
  const [events, setEvents] = useState<MockEvent[]>(EVENTS)
  const [showTypes, setShowTypes] = useState(false)

  const { data: eventTypes } = useEventTypes()
  const types = eventTypes ?? []

  const filtered = events
    .filter((e) => !typeFilter || e.event_type_id === typeFilter)
    .filter((e) => !childFilter || e.child_id === childFilter)
    .sort((a, b) => a.date.localeCompare(b.date))

  const toggleDone = (id: string) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, status: e.status === 'done' ? 'pending' : 'done' } : e,
      ),
    )
  }

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
          <button type="button" className="btn btn--primary btn--sm">
            Crear Evento
          </button>
        </div>
      </div>

      {showTypes && <EventTypesManager />}

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
        {CHILDREN.map((c) => (
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
          {filtered.map((ev) => {
            const evType = eventTypeById(types, ev.event_type_id)
            const child = ev.child_id ? childById(ev.child_id) : null
            return (
              <li className="evento-item" key={ev.id}>
                <span className="evento-item__icon">{eventIcon(evType?.icon ?? 'circle')}</span>
                <div className="evento-item__body">
                  <span className="evento-item__title">{ev.title}</span>
                  <span className="evento-item__meta">
                    {formatDate(ev.date)}
                    {ev.time && ` · ${ev.time}`}
                    {evType && ` · ${evType.name}`}
                    {child && ` · ${child.name}`}
                  </span>
                </div>
                <div className="evento-item__actions">
                  {statusPill(ev.status)}
                  {ev.status !== 'done' && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Marcar ${ev.title} como hecho`}
                      title="Marcar hecho"
                      onClick={() => toggleDone(ev.id)}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
