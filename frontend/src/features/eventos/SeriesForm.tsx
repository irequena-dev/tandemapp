import { useMemo, useState, type FormEvent } from 'react'
import { computeOccurrences } from './series-api'
import type { EventTypeOut, SeriesCreate } from './types'
import './eventos.css'

const WEEKDAYS = [
  { value: 0, label: 'Lunes' },
  { value: 1, label: 'Martes' },
  { value: 2, label: 'Miércoles' },
  { value: 3, label: 'Jueves' },
  { value: 4, label: 'Viernes' },
  { value: 5, label: 'Sábado' },
  { value: 6, label: 'Domingo' },
]

const PREVIEW_LIMIT = 12

function formatPreview(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

type Props = {
  types: EventTypeOut[]
  children: { id: string; name: string }[]
  members?: { id: string; display_name: string | null }[]
  onSubmit: (data: SeriesCreate) => void
  onCancel: () => void
}

/** Alta de una Serie recurrente acotada con previsualización de ocurrencias. */
export function SeriesForm({ types, children, members = [], onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState('')
  const [typeId, setTypeId] = useState(types[0]?.id ?? '')
  const [subject, setSubject] = useState('')
  const [time, setTime] = useState('')
  const [cadence, setCadence] = useState<SeriesCreate['cadence']>('weekly')
  const [dayOfWeek, setDayOfWeek] = useState(0)
  const [startsAt, setStartsAt] = useState('')
  const [boundKind, setBoundKind] = useState<'max_count' | 'ends_at'>('max_count')
  const [maxCount, setMaxCount] = useState(4)
  const [endsAt, setEndsAt] = useState('')

  const needsDay = cadence === 'weekly' || cadence === 'biweekly'

  const occurrences = useMemo(
    () =>
      startsAt
        ? computeOccurrences({
            cadence,
            day_of_week: needsDay ? dayOfWeek : null,
            starts_at: startsAt,
            ends_at: boundKind === 'ends_at' ? endsAt || null : null,
            max_count: boundKind === 'max_count' ? maxCount : null,
          })
        : [],
    [cadence, dayOfWeek, needsDay, startsAt, boundKind, endsAt, maxCount],
  )

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !startsAt || !typeId) return
    if (boundKind === 'max_count' && (!maxCount || maxCount < 1)) return
    if (boundKind === 'ends_at' && !endsAt) return
    const isChild = subject.startsWith('child:')
    const isMember = subject.startsWith('member:')
    onSubmit({
      title: title.trim(),
      event_type_id: typeId,
      child_id: isChild ? subject.slice(6) : null,
      member_id: isMember ? subject.slice(7) : null,
      time: time || null,
      cadence,
      day_of_week: needsDay ? dayOfWeek : null,
      starts_at: startsAt,
      ends_at: boundKind === 'ends_at' ? endsAt : null,
      max_count: boundKind === 'max_count' ? maxCount : null,
    })
  }

  return (
    <form className="evento-form evento-form--serie" onSubmit={handleSubmit}>
      <input
        className="evento-form__input"
        type="text"
        aria-label="Título"
        placeholder="Título de la serie…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        autoFocus
      />
      <div className="evento-form__row">
        <select
          className="evento-form__input"
          aria-label="Tipo"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          required
        >
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          className="evento-form__input"
          aria-label="Para quién"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">Familia</option>
          <optgroup label="Hijos">
            {children.map((c) => (
              <option key={c.id} value={`child:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Miembros">
            {members.map((m) => (
              <option key={m.id} value={`member:${m.id}`}>
                {m.display_name ?? m.id}
              </option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="evento-form__row">
        <input
          className="evento-form__input"
          type="date"
          aria-label="Comienza el"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />
        <input
          className="evento-form__input"
          type="time"
          aria-label="Hora"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      </div>
      <div className="evento-form__row">
        <select
          className="evento-form__input"
          aria-label="Repetir"
          value={cadence}
          onChange={(e) => setCadence(e.target.value as SeriesCreate['cadence'])}
        >
          <option value="weekly">Cada semana</option>
          <option value="biweekly">Cada 2 semanas</option>
          <option value="monthly">Cada mes</option>
        </select>
        {needsDay && (
          <select
            className="evento-form__input"
            aria-label="Día de la semana"
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
          >
            {WEEKDAYS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="evento-form__row">
        <select
          className="evento-form__input"
          aria-label="Termina"
          value={boundKind}
          onChange={(e) => setBoundKind(e.target.value as 'max_count' | 'ends_at')}
        >
          <option value="max_count">Nº de ocurrencias</option>
          <option value="ends_at">Hasta una fecha</option>
        </select>
        {boundKind === 'max_count' ? (
          <input
            className="evento-form__input"
            type="number"
            min={1}
            aria-label="Nº de ocurrencias"
            value={maxCount}
            onChange={(e) => setMaxCount(Number(e.target.value))}
            required
          />
        ) : (
          <input
            className="evento-form__input"
            type="date"
            aria-label="Hasta"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        )}
      </div>

      {occurrences.length > 0 && (
        <ul className="evento-form__preview" aria-label="Vista previa de ocurrencias">
          {occurrences.slice(0, PREVIEW_LIMIT).map((iso) => (
            <li key={iso} data-date={iso}>
              {formatPreview(iso)}
            </li>
          ))}
          {occurrences.length > PREVIEW_LIMIT && (
            <li className="evento-form__preview-more">
              +{occurrences.length - PREVIEW_LIMIT} más…
            </li>
          )}
        </ul>
      )}

      <div className="evento-form__actions">
        <button type="submit" className="btn btn--primary btn--sm">
          Crear serie
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
