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
import { useToast } from '../toasts/useToast'
import {
  useCreateHealthVisit,
  useDeleteHealthVisit,
  useHealthVisits,
  useUpdateHealthVisit,
} from '../health-visits/api'
import type { HealthVisit } from '../health-visits/types'
import { SizesSection } from '../sizes/SizesSection'
import '../sizes/sizes.css'
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
  const createMeasurement = useCreateMeasurement(childId ?? '')
  const toast = useToast()

  // Visitas médicas — real API
  const { data: visitas = [] } = useHealthVisits(childId ?? '')
  const createVisit = useCreateHealthVisit(childId ?? '')
  const updateVisit = useUpdateHealthVisit(childId ?? '')
  const deleteVisit = useDeleteHealthVisit(childId ?? '')

  const [showVisitForm, setShowVisitForm] = useState(false)
  const [editingVisit, setEditingVisit] = useState<HealthVisit | undefined>()
  const [visitDetail, setVisitDetail] = useState<HealthVisit | undefined>()
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [showForm, setShowForm] = useState(false)
  const [editingMeasurement, setEditingMeasurement] = useState<Measurement | undefined>()

  // Confirmación inline de borrado (patrón .hijo-confirm): cada fila destructiva
  // pasa por un "¿Borrar? [Borrar] [Cancelar]" antes de mutar. Al borrar con
  // éxito ofrecemos un toast con "Deshacer" que re-crea la entidad vía create —
  // un resbalón de pulgar nunca debe destruir silenciosamente un registro.
  const [confirmingMeasurement, setConfirmingMeasurement] = useState<string | null>(null)
  const [confirmingVisit, setConfirmingVisit] = useState<string | null>(null)

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
  function handleEdit(m: Measurement) {
    setEditingMeasurement(m)
    setShowForm(true)
  }

  function handleFormDone() {
    setShowForm(false)
    setEditingMeasurement(undefined)
  }

  function handleConfirmDeleteMeasurement(m: Measurement) {
    deleteMutation.mutate(m.id, {
      onSuccess: () => {
        setConfirmingMeasurement(null)
        toast.success(
          <>
            <strong>Medida borrada.</strong>{' '}
            <button
              type="button"
              className="toast__action"
              onClick={() =>
                createMeasurement.mutate({
                  type: m.type,
                  value: m.value,
                  unit: m.unit,
                  measured_at: m.measured_at,
                })
              }
            >
              Deshacer
            </button>
          </>,
          { duration: 6000 },
        )
      },
      onError: () => toast.error('No se pudo borrar la medida'),
    })
  }

  function handleConfirmDeleteVisit(v: HealthVisit) {
    deleteVisit.mutate(v.id, {
      onSuccess: () => {
        setConfirmingVisit(null)
        toast.success(
          <>
            <strong>Visita borrada.</strong>{' '}
            <button
              type="button"
              className="toast__action"
              onClick={() =>
                createVisit.mutate({
                  visited_at: v.visited_at,
                  diagnosis: v.diagnosis,
                  notes: v.notes ?? undefined,
                })
              }
            >
              Deshacer
            </button>
          </>,
          { duration: 6000 },
        )
      },
      onError: () => toast.error('No se pudo borrar la visita'),
    })
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
                  {confirmingMeasurement === m.id ? (
                    <div
                      className="hijo-confirm growth-row__confirm"
                      role="group"
                      aria-label="Borrar medida"
                    >
                      <span className="hijo-confirm__label">¿Borrar?</span>
                      <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        onClick={() => setConfirmingMeasurement(null)}
                        disabled={deleteMutation.isPending}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger-solid btn--sm"
                        onClick={() => handleConfirmDeleteMeasurement(m)}
                        disabled={deleteMutation.isPending}
                      >
                        {deleteMutation.isPending ? 'Borrando…' : 'Borrar'}
                      </button>
                    </div>
                  ) : (
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
                        onClick={() => setConfirmingMeasurement(m.id)}
                        aria-label="Borrar medida"
                      >
                        <TrashIcon />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {/* Visitas médicas */}
      <VisitasSection
        childId={childId}
        visitas={visitas}
        createVisit={createVisit}
        updateVisit={updateVisit}
        deleteVisit={deleteVisit}
        showForm={showVisitForm}
        setShowForm={setShowVisitForm}
        editing={editingVisit}
        setEditing={setEditingVisit}
        detail={visitDetail}
        setDetail={setVisitDetail}
        filterFrom={filterFrom}
        setFilterFrom={setFilterFrom}
        filterTo={filterTo}
        setFilterTo={setFilterTo}
        confirmingVisit={confirmingVisit}
        setConfirmingVisit={setConfirmingVisit}
        onConfirmDeleteVisit={handleConfirmDeleteVisit}
      />
    </div>
  )
}

/* ---------- Visitas médicas section ---------- */

type VisitasSectionProps = {
  childId: string
  visitas: HealthVisit[]
  createVisit: ReturnType<typeof useCreateHealthVisit>
  updateVisit: ReturnType<typeof useUpdateHealthVisit>
  deleteVisit: ReturnType<typeof useDeleteHealthVisit>
  showForm: boolean
  setShowForm: (v: boolean) => void
  editing: HealthVisit | undefined
  setEditing: (v: HealthVisit | undefined) => void
  detail: HealthVisit | undefined
  setDetail: (v: HealthVisit | undefined) => void
  filterFrom: string
  setFilterFrom: (v: string) => void
  filterTo: string
  setFilterTo: (v: string) => void
  confirmingVisit: string | null
  setConfirmingVisit: (v: string | null) => void
  onConfirmDeleteVisit: (v: HealthVisit) => void
}

function VisitasSection({
  visitas,
  createVisit,
  updateVisit,
  deleteVisit,
  showForm,
  setShowForm,
  editing,
  setEditing,
  detail,
  setDetail,
  filterFrom,
  setFilterFrom,
  filterTo,
  setFilterTo,
  confirmingVisit,
  setConfirmingVisit,
  onConfirmDeleteVisit,
}: VisitasSectionProps) {
  const filtered = visitas
    .filter((v) => !filterFrom || v.visited_at >= filterFrom)
    .filter((v) => !filterTo || v.visited_at <= filterTo)
    .sort((a, b) => b.visited_at.localeCompare(a.visited_at))

  if (detail) {
    return (
      <section className="hijo-detail__section">
        <div className="visita-detail">
          <div className="visita-detail__header">
            <button
              type="button"
              className="visita-detail__back"
              onClick={() => setDetail(undefined)}
            >
              <ArrowLeft /> Volver
            </button>
            <span className="visita-detail__date">{formatDate(detail.visited_at)}</span>
          </div>
          <div className="visita-detail__section">
            <h3>Diagnóstico</h3>
            <p className="visita-detail__text">{detail.diagnosis}</p>
          </div>
          {detail.notes != null && (
            <div className="visita-detail__section">
              <h3>Notas</h3>
              <p className="visita-detail__text">
                {typeof detail.notes === 'string' ? detail.notes : JSON.stringify(detail.notes)}
              </p>
            </div>
          )}
          {detail.pauta_ids.length > 0 && (
            <Link to="/pautas" className="visita-detail__pautas-link">
              Ver Pautas asociadas →
            </Link>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="hijo-detail__section">
      <div className="hijo-detail__section-header">
        <h2 className="hijo-detail__section-title">Visitas médicas</h2>
        {!showForm && (
          <button
            type="button"
            className="hijo-detail__add-btn"
            onClick={() => { setEditing(undefined); setShowForm(true) }}
            aria-label="Registrar visita"
          >
            <PlusIcon /> Visita
          </button>
        )}
      </div>

      {/* Date filter */}
      <div className="visita-filter">
        <label className="visita-filter__label">
          Desde
          <input
            type="date"
            className="visita-filter__input"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </label>
        <label className="visita-filter__label">
          Hasta
          <input
            type="date"
            className="visita-filter__input"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </label>
        {(filterFrom || filterTo) && (
          <button
            type="button"
            className="visita-filter__clear"
            onClick={() => { setFilterFrom(''); setFilterTo('') }}
          >
            Limpiar
          </button>
        )}
      </div>

      {showForm && (
        <VisitaForm
          editing={editing}
          onCreate={(input) => {
            createVisit.mutate(input, { onSuccess: () => setShowForm(false) })
          }}
          onUpdate={(id, patch) => {
            updateVisit.mutate({ id, patch }, { onSuccess: () => { setShowForm(false); setEditing(undefined) } })
          }}
          onCancel={() => { setShowForm(false); setEditing(undefined) }}
        />
      )}

      {filtered.length === 0 ? (
        <div className="hijo-detail__empty">
          Sin visitas médicas registradas.
        </div>
      ) : (
        <ul className="hijo-detail__visitas">
          {filtered.map((v) => (
            <li className="visita-row" key={v.id}>
              <button
                type="button"
                className="visita-row__btn"
                onClick={() => setDetail(v)}
              >
                <span className="visita-row__date">{formatDate(v.visited_at)}</span>
                <span className="visita-row__diagnosis">{v.diagnosis}</span>
              </button>
              {confirmingVisit === v.id ? (
                <div
                  className="hijo-confirm visita-row__confirm"
                  role="group"
                  aria-label="Borrar visita"
                >
                  <span className="hijo-confirm__label">¿Borrar?</span>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setConfirmingVisit(null)}
                    disabled={deleteVisit.isPending}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger-solid btn--sm"
                    onClick={() => onConfirmDeleteVisit(v)}
                    disabled={deleteVisit.isPending}
                  >
                    {deleteVisit.isPending ? 'Borrando…' : 'Borrar'}
                  </button>
                </div>
              ) : (
                <span className="visita-row__actions">
                  <button
                    type="button"
                    className="visita-action-btn"
                    onClick={() => { setEditing(v); setShowForm(true) }}
                    aria-label="Editar visita"
                  >
                    <EditIcon />
                  </button>
                  <button
                    type="button"
                    className="visita-action-btn visita-action-btn--danger"
                    onClick={() => setConfirmingVisit(v.id)}
                    aria-label="Borrar visita"
                  >
                    <TrashIcon />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ---------- Visita form ---------- */

type VisitaFormProps = {
  editing?: HealthVisit
  onCreate: (input: { visited_at: string; diagnosis: string; notes?: unknown }) => void
  onUpdate: (id: string, patch: { visited_at?: string; diagnosis?: string; notes?: unknown }) => void
  onCancel: () => void
}

function VisitaForm({ editing, onCreate, onUpdate, onCancel }: VisitaFormProps) {
  const [visitedAt, setVisitedAt] = useState(
    editing?.visited_at ?? new Date().toISOString().slice(0, 10),
  )
  const [diagnosis, setDiagnosis] = useState(editing?.diagnosis ?? '')
  const [notes, setNotes] = useState(
    editing?.notes != null
      ? typeof editing.notes === 'string'
        ? editing.notes
        : JSON.stringify(editing.notes)
      : '',
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!diagnosis.trim()) return
    const notesValue = notes.trim() || undefined
    if (editing) {
      onUpdate(editing.id, { visited_at: visitedAt, diagnosis, notes: notesValue })
    } else {
      onCreate({ visited_at: visitedAt, diagnosis, notes: notesValue })
    }
  }

  return (
    <form className="visita-form" onSubmit={handleSubmit}>
      <label className="visita-form__label">
        Fecha
        <input
          type="date"
          className="visita-form__input"
          value={visitedAt}
          onChange={(e) => setVisitedAt(e.target.value)}
          required
        />
      </label>
      <label className="visita-form__label">
        Diagnóstico
        <input
          type="text"
          className="visita-form__input"
          value={diagnosis}
          onChange={(e) => setDiagnosis(e.target.value)}
          placeholder="Ej: revisión pediátrica"
          required
        />
      </label>
      <label className="visita-form__label">
        Notas
        <textarea
          className="visita-form__textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tratamiento, observaciones…"
          rows={3}
        />
      </label>
      <div className="visita-form__actions">
        <button type="submit" className="visita-form__btn visita-form__btn--primary">
          {editing ? 'Guardar' : 'Registrar'}
        </button>
        <button type="button" className="visita-form__btn visita-form__btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
