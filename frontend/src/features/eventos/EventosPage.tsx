import { useCallback, useEffect, useMemo, useState } from 'react'
import { useChildren } from '../children/api'
import { useEventTypes } from './event-types-api'
import { useEvents, useCreateEvent, useUpdateEvent, useDeleteEvent, useDoneEvent, useUndoEvent } from './events-api'
import { useCreateSeries, useDeleteSeriesFuture } from './series-api'
import { useToast } from '../toasts/useToast'
import { EventTypesManager } from './EventTypesManager'
import { SeriesForm } from './SeriesForm'
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
      // Default recognisable: a calendar tick — reads as "an event", not a placeholder dot.
      return <svg {...props}><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /><path d="M8 14h3" /></svg>
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
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className="eventos__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

/* ---------- Dates ---------- */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const r = new Date(y, m - 1, d)
  r.setDate(r.getDate() + days)
  return `${r.getFullYear()}-${pad(r.getMonth() + 1)}-${pad(r.getDate())}`
}

/** Etiqueta relativa legible para la superficie de consulta. Reduce la carga
 *  de parsear fechas absolutas en un vistazo ("Hoy", "Mañana", "Ayer"…). */
function relativeDay(iso: string, today: string): string | null {
  if (iso === today) return 'Hoy'
  if (iso === shiftISO(today, 1)) return 'Mañana'
  if (iso === shiftISO(today, 2)) return 'Pasado mañana'
  if (iso === shiftISO(today, -1)) return 'Ayer'
  if (iso === shiftISO(today, -2)) return 'Anteayer'
  return null
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

type EventDraft = {
  title: string
  date: string
  time: string | null
  event_type_id: string
  child_id: string | null
}

function toDraft(ev: EventOut): EventDraft {
  return {
    title: ev.title,
    date: ev.date,
    time: ev.time,
    event_type_id: ev.event_type_id,
    child_id: ev.child_id,
  }
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
  onSubmit: (data: EventDraft) => void
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

/* ---------- Filter panel (shared between sheet and inline active chips) ---------- */

type FilterPanelProps = {
  types: EventTypeOut[]
  kids: { id: string; name: string }[]
  typeFilter: string | null
  childFilter: string | null
  setTypeFilter: (v: string | null) => void
  setChildFilter: (v: string | null) => void
}

function FilterPanel({ types, kids, typeFilter, childFilter, setTypeFilter, setChildFilter }: FilterPanelProps) {
  return (
    <div className="eventos__filter-sheet-body">
      <div className="eventos__filter-group">
        <span className="eventos__filter-label" id="ev-filter-tipo">Por tipo</span>
        <div className="eventos__filter-pills" role="group" aria-labelledby="ev-filter-tipo">
          <button
            type="button"
            aria-pressed={!typeFilter}
            className={`eventos__filter${!typeFilter ? ' eventos__filter--active' : ''}`}
            onClick={() => setTypeFilter(null)}
          >
            Todos
          </button>
          {types.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={typeFilter === t.id}
              className={`eventos__filter${typeFilter === t.id ? ' eventos__filter--active' : ''}`}
              onClick={() => setTypeFilter(typeFilter === t.id ? null : t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>
      {kids.length > 0 && (
        <div className="eventos__filter-group">
          <span className="eventos__filter-label" id="ev-filter-hijo">Por Hijo</span>
          <div className="eventos__filter-pills" role="group" aria-labelledby="ev-filter-hijo">
            <button
              type="button"
              aria-pressed={!childFilter}
              className={`eventos__filter${!childFilter ? ' eventos__filter--active' : ''}`}
              onClick={() => setChildFilter(null)}
            >
              Todos
            </button>
            {kids.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={childFilter === c.id}
                className={`eventos__filter${childFilter === c.id ? ' eventos__filter--active' : ''}`}
                onClick={() => setChildFilter(childFilter === c.id ? null : c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

type FilterSheetProps = FilterPanelProps & {
  open: boolean
  onClose: () => void
}

function FilterSheet({ open, onClose, ...panelProps }: FilterSheetProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div id="ev-filters-sheet" className="eventos__filter-sheet" role="dialog" aria-modal="true" aria-labelledby="ev-filters-title">
      <div className="eventos__filter-sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="eventos__filter-sheet-panel">
        <div className="eventos__filter-sheet-header">
          <h2 id="ev-filters-title" className="eventos__filter-sheet-title">Filtros</h2>
          <button
            type="button"
            className="eventos__filter-sheet-close"
            aria-label="Cerrar filtros"
            onClick={onClose}
          >
            <XIcon />
          </button>
        </div>
        <FilterPanel {...panelProps} />
      </div>
    </div>
  )
}

type ActiveFilterChipsProps = FilterPanelProps

function ActiveFilterChips({ types, kids, typeFilter, childFilter, setTypeFilter, setChildFilter }: ActiveFilterChipsProps) {
  const typeName = typeFilter ? types.find((t) => t.id === typeFilter)?.name : null
  const childName = childFilter ? kids.find((c) => c.id === childFilter)?.name : null
  if (!typeName && !childName) return null

  return (
    <div className="eventos__active-filters" aria-label="Filtros activos">
      {typeName && (
        <button
          type="button"
          className="eventos__active-filter"
          onClick={() => setTypeFilter(null)}
          aria-label={`Quitar filtro ${typeName}`}
        >
          <span>{typeName}</span>
          <XIcon />
        </button>
      )}
      {childName && (
        <button
          type="button"
          className="eventos__active-filter"
          onClick={() => setChildFilter(null)}
          aria-label={`Quitar filtro ${childName}`}
        >
          <span>{childName}</span>
          <XIcon />
        </button>
      )}
      <button
        type="button"
        className="eventos__clear-filters"
        onClick={() => { setTypeFilter(null); setChildFilter(null) }}
      >
        Limpiar
      </button>
    </div>
  )
}

/* ---------- Main ---------- */

type SectionKey = 'atrasados' | 'hoy' | 'proximos'

export function EventosPage() {
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [childFilter, setChildFilter] = useState<string | null>(null)
  const [showTypes, setShowTypes] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [showSeries, setShowSeries] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Serie cuyo "Borrar futuras" está pidiendo confirmación inline (destructivo
  // bulk): null = ninguna. Espeja el patrón de confirmación por-fila de Pautas.
  const [confirmingSeriesId, setConfirmingSeriesId] = useState<string | null>(null)
  // Eventos borrados recientemente para deshacer persistente (no timed toast)
  const [recentlyDeleted, setRecentlyDeleted] = useState<EventOut[]>([])
  // Atajos de teclado: evento seleccionado y modal de ayuda
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false)

  const { data: eventTypes } = useEventTypes()
  const { data: childrenData } = useChildren()
  const { data: events, isLoading: eventsLoading, error: eventsError, refetch } = useEvents()
  const createMut = useCreateEvent()
  const updateMut = useUpdateEvent()
  const deleteMut = useDeleteEvent()
  const doneMut = useDoneEvent()
  const undoMut = useUndoEvent()
  const createSeriesMut = useCreateSeries()
  const deleteSeriesFutureMut = useDeleteSeriesFuture()
  const toast = useToast()

  const types = eventTypes ?? []
  const kids = childrenData ?? []
  const allEvents = useMemo(() => events ?? [], [events])
  const today = todayISO()

  const filtered = useMemo(
    () =>
      allEvents
        .filter((e) => !typeFilter || e.event_type_id === typeFilter)
        .filter((e) => !childFilter || e.child_id === childFilter),
    [allEvents, typeFilter, childFilter],
  )

  // La ruta de lectura agrupa por urgencia temporal (Atrasados → Hoy → Próximos)
  // y retira los hechos a una sección colapsable: la mirada de 3 segundos
  // devuelve lo que importa ahora, no un volcado ascendente por fecha.
  const { sections, done } = useMemo(() => {
    const pending = filtered.filter((e) => e.status !== 'done')
    const done = filtered
      .filter((e) => e.status === 'done')
      .sort((a, b) => b.date.localeCompare(a.date))
    const byDateAsc = (a: EventOut, b: EventOut) =>
      a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')

    const atrasados = pending.filter((e) => e.date < today).sort(byDateAsc)
    const hoy = pending.filter((e) => e.date === today).sort(byDateAsc)
    const proximos = pending.filter((e) => e.date > today).sort(byDateAsc)

    const sections = [
      { key: 'atrasados' as const, title: 'Atrasados', overdue: true as const, items: atrasados },
      { key: 'hoy' as const, title: 'Hoy', items: hoy },
      { key: 'proximos' as const, title: 'Próximos', items: proximos },
    ].filter((s) => s.items.length > 0) as { key: SectionKey; title: string; overdue?: boolean; items: EventOut[] }[]
    return { sections, done }
  }, [filtered, today])

  // Lista plana de todos los eventos visibles (pendientes) para navegación por teclado
  const allVisibleEvents = useMemo(() => {
    return sections.flatMap(s => s.items)
  }, [sections])

  const handleCreate = (data: EventDraft) => {
    createMut.mutate(data, {
      onSuccess: () => toast.success('Evento creado'),
      onError: () => toast.error('No se pudo crear el evento'),
    })
    setShowCreate(false)
  }

  const handleUpdate = (id: string, data: EventDraft) => {
    updateMut.mutate({ id, patch: data }, {
      onSuccess: () => toast.success('Evento actualizado'),
      onError: () => toast.error('No se pudo guardar el evento'),
    })
    setEditingId(null)
  }

  // Borrado con deshacer persistente: la eliminación es optimista (ya desaparece de la
  // lista) y el evento se guarda en "Reciente borrado" para deshacer manual.
  // Así un resbalón de pulgar nunca es irreversible, incluso si el Miembro es interrumpido.
  const handleDelete = (ev: EventOut) => {
    deleteMut.mutate(ev.id, {
      onError: () => toast.error('No se pudo borrar el evento'),
      onSuccess: () => {
        setRecentlyDeleted((prev) => [ev, ...prev])
      },
    })
  }

  const handleUndoDelete = (ev: EventOut) => {
    createMut.mutate(toDraft(ev), {
      onSuccess: () => {
        setRecentlyDeleted((prev) => prev.filter((e) => e.id !== ev.id))
        toast.success('Evento restaurado')
      },
      onError: () => toast.error('No se pudo restaurar el evento'),
    })
  }

  const handleClearRecentlyDeleted = () => {
    setRecentlyDeleted([])
  }

  const handleDone = (ev: EventOut) => {
    doneMut.mutate(ev.id, {
      onError: () => toast.error('No se pudo marcar como hecho'),
    })
  }

  const handleUndo = (ev: EventOut) => {
    undoMut.mutate(ev.id, {
      onError: () => toast.error('No se pudo deshacer'),
    })
  }

  // "Borrar futuras" es un borrado bulk de toda la serie futura: lo gatingamos
  // tras una confirmación inline (patrón de Pautas) y avisamos del resultado.
  const handleConfirmDeleteSeriesFuture = (seriesId: string) => {
    deleteSeriesFutureMut.mutate(seriesId, {
      onSuccess: () => toast.success('Ocurrencias futuras borradas'),
      onError: () => toast.error('No se pudieron borrar las futuras'),
    })
    setConfirmingSeriesId(null)
  }

  const editingEvent = editingId ? allEvents.find((e) => e.id === editingId) : null

  // ¿Tiene un Evento una mutación en curso? Deshabilita su botón para evitar
  // doble-disparo y deja ver el estado pendiente por fila.
  const isBusy = (ev: EventOut) =>
    (deleteMut.isPending && deleteMut.variables === ev.id) ||
    (doneMut.isPending && doneMut.variables === ev.id) ||
    (undoMut.isPending && undoMut.variables === ev.id)

  // Manejo de atajos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorar si estamos en un input/textarea para no interferir con la escritura
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      // Ignorar si hay modificadores (Ctrl, Alt, Meta) para no interferir con atajos del navegador
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return
      }

      switch (e.key) {
        case 'n':
          e.preventDefault()
          setShowCreate(true)
          setEditingId(null)
          setShowSeries(false)
          break
        case 'j':
          e.preventDefault()
          if (allVisibleEvents.length > 0) {
            const currentIndex = selectedEventId ? allVisibleEvents.findIndex(ev => ev.id === selectedEventId) : -1
            const nextIndex = currentIndex < allVisibleEvents.length - 1 ? currentIndex + 1 : 0
            setSelectedEventId(allVisibleEvents[nextIndex].id)
          }
          break
        case 'k':
          e.preventDefault()
          if (allVisibleEvents.length > 0) {
            const currentIndex = selectedEventId ? allVisibleEvents.findIndex(ev => ev.id === selectedEventId) : 0
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : allVisibleEvents.length - 1
            setSelectedEventId(allVisibleEvents[prevIndex].id)
          }
          break
        case 'x':
          e.preventDefault()
          if (selectedEventId) {
            const selectedEvent = allVisibleEvents.find(ev => ev.id === selectedEventId)
            if (selectedEvent) {
              if (selectedEvent.status === 'done') {
                handleUndo(selectedEvent)
              } else {
                handleDone(selectedEvent)
              }
            }
          }
          break
        case '?':
          e.preventDefault()
          setShowKeyboardHelp(true)
          break
        case 'Escape':
          if (showKeyboardHelp) {
            setShowKeyboardHelp(false)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allVisibleEvents, selectedEventId, showKeyboardHelp, handleDone, handleUndo])

  const renderItem = (ev: EventOut, opts: { done?: boolean } = {}) => {
    const rel = relativeDay(ev.date, today)
    const isSelected = selectedEventId === ev.id
    return (
      <li className={`evento-item${opts.done ? ' evento-item--done' : ''}${isSelected ? ' evento-item--selected' : ''}`} key={ev.id}>
        <div className="evento-item__titlerow">
          <span className="evento-item__title">{ev.title}</span>
        </div>
        <div className="evento-item__metarow">
          <span className="evento-item__icon" aria-hidden="true">{eventIcon(ev.event_type?.icon ?? 'calendar')}</span>
          <div className="evento-item__meta">
            <span className="evento-chip evento-chip--date ds-nums">
              {rel && <span className="evento-chip__rel">{rel}</span>}
              <span className="evento-chip__abs">{formatDate(ev.date)}</span>
            </span>
            {ev.time && (
              <span className="evento-chip evento-chip--time ds-nums">{formatTime(ev.time)}</span>
            )}
            {ev.event_type && <span className="evento-chip">{ev.event_type.name}</span>}
            {ev.child && <span className="evento-chip">{ev.child.name}</span>}
          </div>
        </div>
        {ev.series_id && (
          <SeriesFutureAction
            seriesId={ev.series_id}
            title={ev.title}
            confirming={confirmingSeriesId === ev.series_id}
            onAskConfirm={() => setConfirmingSeriesId(ev.series_id)}
            onCancelConfirm={() => setConfirmingSeriesId(null)}
            onConfirm={() => handleConfirmDeleteSeriesFuture(ev.series_id!)}
            pending={deleteSeriesFutureMut.isPending && deleteSeriesFutureMut.variables === ev.series_id}
          />
        )}
        <div className="evento-item__footer">
          {statusVisual(ev)}
          <div className="evento-item__actions">
            {ev.status === 'done' ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Deshacer ${ev.title}`}
              title="Deshacer"
              disabled={isBusy(ev)}
              onClick={() => handleUndo(ev)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              className="icon-btn"
              aria-label={`Marcar ${ev.title} como hecho`}
              title="Marcar hecho"
              disabled={isBusy(ev)}
              onClick={() => handleDone(ev)}
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
            onClick={() => { setEditingId(ev.id); setShowCreate(false); setShowSeries(false) }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            </svg>
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            aria-label={`Borrar ${ev.title}`}
            title="Borrar"
            disabled={isBusy(ev)}
            onClick={() => handleDelete(ev)}
          >
            <TrashIcon />
          </button>
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="eventos" aria-labelledby="eventos-title">
      <div className="eventos__head">
        <h1 className="eventos__title" id="eventos-title">Eventos</h1>
        <div className="eventos__head-actions">
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="ev-filters-sheet"
            aria-pressed={filtersOpen}
            className={`eventos__toggle${filtersOpen ? ' eventos__toggle--active' : ''}`}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <FilterIcon />
            <span>Filtros</span>
            {(typeFilter || childFilter) && (
              <span className="eventos__filter-badge">
                {(typeFilter ? 1 : 0) + (childFilter ? 1 : 0)}
              </span>
            )}
          </button>
          <button
            type="button"
            aria-pressed={showTypes}
            className={`eventos__toggle${showTypes ? ' eventos__toggle--active' : ''}`}
            onClick={() => setShowTypes((v) => !v)}
          >
            Gestionar tipos
          </button>
          <button
            type="button"
            aria-pressed={showSeries}
            className={`eventos__toggle${showSeries ? ' eventos__toggle--active' : ''}`}
            onClick={() => {
              setShowSeries((v) => !v)
              setShowCreate(false)
              setEditingId(null)
            }}
          >
            Crear Serie
          </button>
        </div>
      </div>

      {showTypes && <EventTypesManager />}

      {showSeries && (
        <SeriesForm
          types={types}
          children={kids}
          onSubmit={(data) => {
            createSeriesMut.mutate(data, {
              onSuccess: (out) => toast.success(`${out.events_created} eventos creados`),
              onError: () => toast.error('No se pudo crear la Serie'),
            })
            setShowSeries(false)
          }}
          onCancel={() => setShowSeries(false)}
        />
      )}

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

      <ActiveFilterChips
        types={types}
        kids={kids}
        typeFilter={typeFilter}
        childFilter={childFilter}
        setTypeFilter={setTypeFilter}
        setChildFilter={setChildFilter}
      />

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        types={types}
        kids={kids}
        typeFilter={typeFilter}
        childFilter={childFilter}
        setTypeFilter={setTypeFilter}
        setChildFilter={setChildFilter}
      />

      {eventsLoading && <EventListSkeleton />}

      {eventsError && !eventsLoading && (
        <div className="eventos__error" role="alert">
          <p>No se pudieron cargar los eventos.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {!eventsLoading && !eventsError && filtered.length === 0 && (
        <div className="eventos__empty">
          <span className="eventos__empty-icon" aria-hidden="true"><CalendarIcon /></span>
          <p className="eventos__empty-title">Sin eventos próximos</p>
          <p className="eventos__empty-text">
            Crea un evento o díctalo por voz. Las citas, cole y trámites aparecerán aquí.
          </p>
        </div>
      )}

      {!eventsLoading && !eventsError && sections.map((s) => (
        <section key={s.key} className="eventos__section">
          <h2
            className={`eventos__section-title${s.overdue ? ' eventos__section-title--overdue' : ''}`}
          >
            {s.overdue && <AlertSmall />}
            <span>{s.title}</span>
            <span className="eventos__section-count ds-nums">{s.items.length}</span>
          </h2>
          <ul className="eventos__list">
            {s.items.map((ev) => renderItem(ev))}
          </ul>
        </section>
      ))}

      {!eventsLoading && !eventsError && done.length > 0 && (
        <section className="eventos__section eventos__section--done">
          <button
            type="button"
            className="eventos__section-toggle"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            <ChevronIcon open={showDone} />
            <span>Hechos</span>
            <span className="eventos__section-count ds-nums">{done.length}</span>
          </button>
          {showDone && (
            <ul className="eventos__list eventos__list--muted">
              {done.map((ev) => renderItem(ev, { done: true }))}
            </ul>
          )}
        </section>
      )}

      {!eventsLoading && !eventsError && recentlyDeleted.length > 0 && (
        <section className="eventos__section eventos__section--deleted">
          <div className="eventos__section-header">
            <h2 className="eventos__section-title eventos__section-title--deleted">
              Reciente borrado
              <span className="eventos__section-count ds-nums">{recentlyDeleted.length}</span>
            </h2>
            <button
              type="button"
              className="eventos__clear-deleted"
              onClick={handleClearRecentlyDeleted}
              aria-label="Limpiar recientes borrados"
            >
              Limpiar
            </button>
          </div>
          <ul className="eventos__list eventos__list--muted">
            {recentlyDeleted.map((ev) => (
              <li className="evento-item evento-item--deleted" key={ev.id}>
                <div className="evento-item__titlerow">
                  <span className="evento-item__title">{ev.title}</span>
                </div>
                <div className="evento-item__metarow">
                  <span className="evento-item__icon" aria-hidden="true">{eventIcon(ev.event_type?.icon ?? 'calendar')}</span>
                  <div className="evento-item__meta">
                    <span className="evento-chip evento-chip--date ds-nums">
                      {relativeDay(ev.date, today) && <span className="evento-chip__rel">{relativeDay(ev.date, today)}</span>}
                      <span className="evento-chip__abs">{formatDate(ev.date)}</span>
                    </span>
                    {ev.time && (
                      <span className="evento-chip evento-chip--time ds-nums">{formatTime(ev.time)}</span>
                    )}
                    {ev.event_type && <span className="evento-chip">{ev.event_type.name}</span>}
                    {ev.child && <span className="evento-chip">{ev.child.name}</span>}
                  </div>
                </div>
                <div className="evento-item__footer">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    onClick={() => handleUndoDelete(ev)}
                    aria-label={`Deshacer ${ev.title}`}
                  >
                    Deshacer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showKeyboardHelp && (
        <div className="eventos__keyboard-help" role="dialog" aria-modal="true" aria-labelledby="keyboard-help-title">
          <div className="eventos__keyboard-help-backdrop" onClick={() => setShowKeyboardHelp(false)} aria-hidden="true" />
          <div className="eventos__keyboard-help-panel">
            <div className="eventos__keyboard-help-header">
              <h2 id="keyboard-help-title" className="eventos__keyboard-help-title">Atajos de teclado</h2>
              <button
                type="button"
                className="eventos__keyboard-help-close"
                aria-label="Cerrar ayuda"
                onClick={() => setShowKeyboardHelp(false)}
              >
                <XIcon />
              </button>
            </div>
            <div className="eventos__keyboard-help-body">
              <div className="eventos__keyboard-help-item">
                <kbd className="eventos__keyboard-help-key">n</kbd>
                <span>Crear nuevo evento</span>
              </div>
              <div className="eventos__keyboard-help-item">
                <kbd className="eventos__keyboard-help-key">j</kbd>
                <span>Siguiente evento</span>
              </div>
              <div className="eventos__keyboard-help-item">
                <kbd className="eventos__keyboard-help-key">k</kbd>
                <span>Evento anterior</span>
              </div>
              <div className="eventos__keyboard-help-item">
                <kbd className="eventos__keyboard-help-key">x</kbd>
                <span>Marcar/desmarcar como hecho</span>
              </div>
              <div className="eventos__keyboard-help-item">
                <kbd className="eventos__keyboard-help-key">?</kbd>
                <span>Mostrar esta ayuda</span>
              </div>
              <div className="eventos__keyboard-help-item">
                <kbd className="eventos__keyboard-help-key">Esc</kbd>
                <span>Cerrar ayuda</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className={`eventos__fab${showCreate ? ' eventos__fab--open' : ''}`}
        aria-label="Crear evento"
        aria-haspopup="dialog"
        aria-expanded={showCreate}
        onClick={() => {
          setShowCreate((v) => !v)
          setEditingId(null)
          setShowSeries(false)
        }}
      >
        {showCreate ? <XIcon /> : <PlusIcon />}
      </button>
    </div>
  )
}

/* ---------- Series future delete (inline confirm) ---------- */

function SeriesFutureAction({
  seriesId,
  title,
  confirming,
  pending,
  onAskConfirm,
  onCancelConfirm,
  onConfirm,
}: {
  seriesId: string
  title: string
  confirming: boolean
  pending: boolean
  onAskConfirm: () => void
  onCancelConfirm: () => void
  onConfirm: () => void
}) {
  if (confirming) {
    return (
      <div className="evento-item__serie-confirm" role="group" aria-label={`Confirmar borrado de futuras de ${title}`}>
        <span className="evento-item__serie-confirm-text">¿Borrar las futuras?</span>
        <button
          type="button"
          className="evento-item__serie-btn evento-item__serie-btn--danger"
          disabled={pending}
          onClick={onConfirm}
          data-series={seriesId}
        >
          Borrar
        </button>
        <button
          type="button"
          className="evento-item__serie-btn"
          disabled={pending}
          onClick={onCancelConfirm}
        >
          Cancelar
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      className="evento-item__serie-link"
      aria-label={`Borrar futuras de ${title}`}
      title="Borrar ocurrencias futuras de esta serie"
      onClick={onAskConfirm}
    >
      Borrar futuras
    </button>
  )
}

/* ---------- Skeleton ---------- */

function EventListSkeleton() {
  return (
    <ul className="eventos__list" aria-busy="true" aria-label="Cargando eventos">
      {Array.from({ length: 4 }).map((_, i) => (
        <li className="evento-item evento-item--skeleton" key={i} aria-hidden="true">
          <span className="evento-skeleton__icon" />
          <div className="evento-item__body">
            <span className="evento-skeleton__line evento-skeleton__line--title" />
            <span className="evento-skeleton__line evento-skeleton__line--meta" />
          </div>
        </li>
      ))}
    </ul>
  )
}
