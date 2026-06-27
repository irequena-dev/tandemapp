import { useState } from 'react'
import type { Child } from '../children/types'
import type { HealthVisit } from '../health-visits/types'
import type { PautaInput } from './types'

const INTERVAL_PRESETS = [
  { value: '8', label: 'Cada 8 h' },
  { value: '6', label: 'Cada 6 h' },
  { value: '4', label: 'Cada 4 h' },
  { value: '12', label: 'Cada 12 h' },
  { value: '24', label: 'Cada 24 h' },
  { value: 'other', label: 'Otro…' },
]

type PautaFormProps = {
  childId?: string
  children: Child[]
  visits: HealthVisit[]
  onSubmit: (input: PautaInput) => void
  onCancel: () => void
  pending?: boolean
}

function formatVisitLabel(v: HealthVisit): string {
  const date = new Date(v.visited_at + 'T00:00:00').toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  })
  return `${date} — ${v.diagnosis}`
}

export function PautaForm({
  childId,
  children,
  visits,
  onSubmit,
  onCancel,
  pending = false,
}: PautaFormProps) {
  const singleChild = children.length === 1
  const [selectedChild, setSelectedChild] = useState(
    childId ?? (singleChild ? children[0].id : ''),
  )
  const [medication, setMedication] = useState('')
  const [dose, setDose] = useState('')
  const [intervalPreset, setIntervalPreset] = useState('8')
  const [customInterval, setCustomInterval] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [visitId, setVisitId] = useState('')

  const effectiveChildId = childId ?? selectedChild
  const childVisits = visits
    .filter((v) => v.child_id === effectiveChildId)
    .slice(0, 3)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const interval =
      intervalPreset === 'other' ? Number(customInterval) : Number(intervalPreset)
    if (!effectiveChildId || !medication.trim() || !dose.trim() || !interval || !Number(durationDays)) return
    onSubmit({
      child_id: effectiveChildId,
      medication: medication.trim(),
      dose: dose.trim(),
      interval_hours: interval,
      duration_days: Number(durationDays),
      health_visit_id: visitId || null,
    })
  }

  return (
    <form className="pauta-form" onSubmit={handleSubmit}>
      {!childId && (
        <label className="pauta-form__label">
          Hijo
          <select
            className="pauta-form__input"
            value={selectedChild}
            onChange={(e) => { setSelectedChild(e.target.value); setVisitId('') }}
            required
          >
            {!singleChild && <option value="">Seleccionar…</option>}
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className="pauta-form__label">
        Medicamento
        <input
          className="pauta-form__input"
          type="text"
          value={medication}
          onChange={(e) => setMedication(e.target.value)}
          placeholder="Ej: Dalsy"
          required
        />
      </label>

      <label className="pauta-form__label">
        Dosis
        <input
          className="pauta-form__input"
          type="text"
          value={dose}
          onChange={(e) => setDose(e.target.value)}
          placeholder="Ej: 5 ml cada toma"
          required
        />
      </label>

      <div className="pauta-form__row">
        <label className="pauta-form__label">
          Cada
          <select
            className="pauta-form__input"
            value={intervalPreset}
            onChange={(e) => setIntervalPreset(e.target.value)}
            required
          >
            {INTERVAL_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {intervalPreset === 'other' && (
          <label className="pauta-form__label">
            Intervalo en horas
            <input
              className="pauta-form__input"
              type="number"
              min={1}
              value={customInterval}
              onChange={(e) => setCustomInterval(e.target.value)}
              placeholder="Horas"
              required
            />
          </label>
        )}

        <label className="pauta-form__label">
          Duración (días)
          <input
            className="pauta-form__input"
            type="number"
            min={1}
            value={durationDays}
            onChange={(e) => setDurationDays(e.target.value)}
            placeholder="Días"
            required
          />
        </label>
      </div>

      {effectiveChildId && childVisits.length > 0 && (
        <label className="pauta-form__label">
          Visita asociada
          <select
            className="pauta-form__input"
            value={visitId}
            onChange={(e) => setVisitId(e.target.value)}
          >
            <option value="">Sin visita asociada</option>
            {childVisits.map((v) => (
              <option key={v.id} value={v.id}>{formatVisitLabel(v)}</option>
            ))}
          </select>
        </label>
      )}

      <div className="pauta-form__actions">
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={pending}
        >
          {pending ? 'Guardando…' : 'Registrar'}
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onCancel}
          disabled={pending}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
