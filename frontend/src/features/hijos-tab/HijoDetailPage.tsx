import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useChildren } from '../children/api'
import { formatAge } from '../children/age'
import {
  useCreateMeasurement,
  useCurrentMeasurements,
  useDeleteMeasurement,
  useMeasurements,
  useUpdateMeasurement,
} from '../measurements/api'
import type { Measurement, MeasurementInput } from '../measurements/types'
import { SizesSection } from '../sizes/SizesSection'
import '../sizes/sizes.css'
import { visitasForChild, type MockVisita } from '../../lib/mock-data'
import './hijos-tab.css'
import '../children/children.css'

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

function toneOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h + (ch.codePointAt(0) ?? 0)) % 6
  return h
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function ArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

/* ---------- Growth Chart (lightweight SVG) ---------- */

type GrowthChartProps = {
  medidas: Measurement[]
  label: string
  unit: string
  color: string
}

function GrowthChart({ medidas, label, unit, color }: GrowthChartProps) {
  if (medidas.length < 2) return null

  const sorted = [...medidas].sort((a, b) => a.measured_at.localeCompare(b.measured_at))
  const values = sorted.map((m) => m.value)
  const dates = sorted.map((m) => new Date(m.measured_at + 'T00:00:00'))

  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1

  const minTime = dates[0].getTime()
  const maxTime = dates[dates.length - 1].getTime()
  const timeRange = maxTime - minTime || 1

  const W = 300
  const H = 140
  const PAD_X = 40
  const PAD_Y = 24
  const CHART_W = W - PAD_X * 2
  const CHART_H = H - PAD_Y * 2

  const points = sorted.map((m, i) => {
    const x = PAD_X + ((dates[i].getTime() - minTime) / timeRange) * CHART_W
    const y = PAD_Y + CHART_H - ((m.value - minVal) / valRange) * CHART_H
    return { x, y, value: m.value, date: dates[i] }
  })

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ')

  const formatShortDate = (d: Date) =>
    d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' })

  return (
    <div className="growth-chart" aria-label={`Gráfica de ${label}`}>
      <div className="growth-chart__header">
        <span className="growth-chart__label">{label}</span>
        <span className="growth-chart__range ds-nums">
          {minVal}–{maxVal} {unit}
        </span>
      </div>
      <svg
        className="growth-chart__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${label}: ${values.join(', ')} ${unit}`}
      >
        <text x={PAD_X - 6} y={PAD_Y + 4} textAnchor="end" className="growth-chart__axis-label">
          {maxVal}
        </text>
        <text x={PAD_X - 6} y={PAD_Y + CHART_H + 4} textAnchor="end" className="growth-chart__axis-label">
          {minVal}
        </text>

        <line x1={PAD_X} y1={PAD_Y} x2={PAD_X + CHART_W} y2={PAD_Y} className="growth-chart__grid" />
        <line x1={PAD_X} y1={PAD_Y + CHART_H} x2={PAD_X + CHART_W} y2={PAD_Y + CHART_H} className="growth-chart__grid" />

        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} />
        ))}

        {points.map((p, i) => (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle" className="growth-chart__axis-label">
            {formatShortDate(p.date)}
          </text>
        ))}
      </svg>
    </div>
  )
}

/* ---------- Measurement form (alta / corrección) ---------- */

type MeasurementFormProps = {
  childId: string
  editing?: Measurement
  onDone: () => void
}

function MeasurementForm({ childId, editing, onDone }: MeasurementFormProps) {
  const create = useCreateMeasurement(childId)
  const update = useUpdateMeasurement(childId)

  const [type, setType] = useState<'height' | 'weight'>(
    (editing?.type as 'height' | 'weight') ?? 'height',
  )
  const [value, setValue] = useState(editing?.value?.toString() ?? '')
  const [measuredAt, setMeasuredAt] = useState(
    editing?.measured_at ?? new Date().toISOString().slice(0, 10),
  )

  const unit = type === 'height' ? 'cm' : 'kg'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const numVal = parseFloat(value)
    if (isNaN(numVal) || numVal <= 0) return

    if (editing) {
      update.mutate(
        { id: editing.id, patch: { value: numVal, unit, measured_at: measuredAt } },
        { onSuccess: onDone },
      )
    } else {
      const input: MeasurementInput = { type, value: numVal, unit, measured_at: measuredAt }
      create.mutate(input, { onSuccess: onDone })
    }
  }

  return (
    <form className="measurement-form" onSubmit={handleSubmit}>
      <div className="measurement-form__row">
        {!editing && (
          <select
            className="measurement-form__select"
            value={type}
            onChange={(e) => setType(e.target.value as 'height' | 'weight')}
            aria-label="Tipo de medida"
          >
            <option value="height">Altura (cm)</option>
            <option value="weight">Peso (kg)</option>
          </select>
        )}
        <input
          className="measurement-form__input"
          type="number"
          step="0.1"
          min="0"
          placeholder={type === 'height' ? 'cm' : 'kg'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label={`Valor en ${unit}`}
          required
        />
        <input
          className="measurement-form__input measurement-form__date"
          type="date"
          value={measuredAt}
          onChange={(e) => setMeasuredAt(e.target.value)}
          aria-label="Fecha de medición"
          required
        />
      </div>
      <div className="measurement-form__actions">
        <button type="submit" className="measurement-form__btn measurement-form__btn--primary">
          {editing ? 'Guardar' : 'Registrar'}
        </button>
        <button type="button" className="measurement-form__btn measurement-form__btn--secondary" onClick={onDone}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/* ---------- Current value highlight ---------- */

function CurrentValue({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) {
  if (value == null) return null
  return (
    <span className="hijo-card__metric">
      <span className="hijo-card__metric-value">{value} {unit}</span>
      <span className="hijo-card__metric-label">{label}</span>
    </span>
  )
}

/* ---------- Main page ---------- */

export function HijoDetailPage() {
  const { childId } = useParams<{ childId: string }>()
  const { data: children } = useChildren()
  const child = children?.find((c) => c.id === childId)
  const { data: measurements = [] } = useMeasurements(childId ?? '')
  const { data: currentM } = useCurrentMeasurements(childId ?? '')
  const deleteMutation = useDeleteMeasurement(childId ?? '')

  // Visitas still from mock (out of scope for this issue)
  const visitas: MockVisita[] = childId ? visitasForChild(childId) : []

  const [showForm, setShowForm] = useState(false)
  const [editingMeasurement, setEditingMeasurement] = useState<Measurement | undefined>()

  if (!childId) {
    return (
      <div className="hijo-detail">
        <Link to="/hijos" className="hijo-detail__back"><ArrowLeft /> Hijos</Link>
        <div className="hijo-detail__empty">Hijo no encontrado</div>
      </div>
    )
  }

  if (!child) {
    return (
      <div className="hijo-detail">
        <Link to="/hijos" className="hijo-detail__back"><ArrowLeft /> Hijos</Link>
        <div className="hijo-detail__empty">Hijo no encontrado</div>
      </div>
    )
  }

  const heights = measurements.filter((m) => m.type === 'height')
  const weights = measurements.filter((m) => m.type === 'weight')
  const sortedMedidas = [...measurements].sort(
    (a, b) => b.measured_at.localeCompare(a.measured_at),
  )
  const sortedVisitas = [...visitas].sort(
    (a, b) => b.date.localeCompare(a.date),
  )

  function handleEdit(m: Measurement) {
    setEditingMeasurement(m)
    setShowForm(true)
  }

  function handleFormDone() {
    setShowForm(false)
    setEditingMeasurement(undefined)
  }

  return (
    <div className="hijo-detail">
      <Link to="/hijos" className="hijo-detail__back"><ArrowLeft /> Hijos</Link>

      {/* Summary card */}
      <div className="hijo-detail__summary">
        <span className="hijo-mono hijo-mono--lg" data-tone={toneOf(child.name)}>
          {initialOf(child.name)}
        </span>
        <div className="hijo-detail__summary-info">
          <div className="hijo-detail__summary-name">{child.name}</div>
          <div className="hijo-detail__summary-age ds-nums">{formatAge(child.birth_date)}</div>
          <div className="hijo-detail__summary-metrics">
            <CurrentValue label="Altura" value={currentM?.height?.value} unit="cm" />
            <CurrentValue label="Peso" value={currentM?.weight?.value} unit="kg" />
          </div>
        </div>
      </div>

      {/* Tallas */}
      {childId && <SizesSection childId={childId} />}

      {/* Crecimiento */}
      <section className="hijo-detail__section">
        <div className="hijo-detail__section-header">
          <h2 className="hijo-detail__section-title">Crecimiento</h2>
          {!showForm && (
            <button
              type="button"
              className="hijo-detail__add-btn"
              onClick={() => { setEditingMeasurement(undefined); setShowForm(true) }}
              aria-label="Registrar medida"
            >
              <PlusIcon /> Medida
            </button>
          )}
        </div>

        {showForm && (
          <MeasurementForm
            childId={childId}
            editing={editingMeasurement}
            onDone={handleFormDone}
          />
        )}

        {sortedMedidas.length === 0 ? (
          <div className="hijo-detail__empty">
            Aún no hay medidas registradas. Dicta una medida por voz o regístrala aquí.
          </div>
        ) : (
          <>
            <GrowthChart
              medidas={heights}
              label="Altura"
              unit="cm"
              color="var(--ds-primary)"
            />
            <GrowthChart
              medidas={weights}
              label="Peso"
              unit="kg"
              color="var(--ds-attention)"
            />
            <ul className="hijo-detail__growth">
              {sortedMedidas.map((m) => (
                <li className="growth-row" key={m.id}>
                  <span className="growth-row__date">{formatDate(m.measured_at)}</span>
                  <span className="growth-row__value ds-nums">{m.value} {m.unit}</span>
                  <span className="growth-row__type">
                    {m.type === 'height' ? 'Altura' : 'Peso'}
                  </span>
                  <span className="growth-row__actions">
                    <button
                      type="button"
                      className="growth-row__action"
                      onClick={() => handleEdit(m)}
                      aria-label="Editar medida"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      className="growth-row__action growth-row__action--danger"
                      onClick={() => deleteMutation.mutate(m.id)}
                      aria-label="Borrar medida"
                    >
                      <TrashIcon />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Visitas médicas */}
      <section className="hijo-detail__section">
        <h2 className="hijo-detail__section-title">Visitas médicas</h2>
        {sortedVisitas.length === 0 ? (
          <div className="hijo-detail__empty">
            Sin visitas médicas registradas.
          </div>
        ) : (
          <ul className="hijo-detail__visitas">
            {sortedVisitas.map((v) => (
              <li className="visita-row" key={v.id}>
                <div className="visita-row__head">
                  <span className="visita-row__title">{v.title}</span>
                  <span className="visita-row__date">{formatDate(v.date)}</span>
                </div>
                <span className="visita-row__diagnosis">{v.diagnosis}</span>
                {v.pauta_ids.length > 0 && (
                  <Link to="/pautas" style={{ fontSize: '0.8125rem', color: 'var(--ds-primary)', fontWeight: 500 }}>
                    Ver Pautas asociadas →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
