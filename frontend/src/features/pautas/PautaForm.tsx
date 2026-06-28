import { useState } from 'react'
import type { Child } from '../children/types'
import type { HealthVisit } from '../health-visits/types'
import type { Member } from '../members/types'
import type { PautaInput, PautaUpdateInput } from './types'

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
  members: Member[]
  visits: HealthVisit[]
  onSubmit: (input: PautaInput) => void
  onCancel: () => void
  pending?: boolean
  initialValues?: PautaUpdateInput
  onUpdate?: (patch: PautaUpdateInput) => void
  defaultSubject?: string
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
  members,
  visits,
  onSubmit,
  onCancel,
  pending = false,
  initialValues,
  onUpdate,
  defaultSubject: explicitDefaultSubject,
}: PautaFormProps) {
  const isEditMode = !!initialValues
  const singleSubject = children.length + members.length === 1
  const defaultSubjectValue = explicitDefaultSubject ?? (childId
    ? `child:${childId}`
    : singleSubject
      ? children.length === 1 ? `child:${children[0].id}` : `member:${members[0].id}`
      : '')
  const [selectedSubject, setSelectedSubject] = useState(defaultSubjectValue)
  const [medication, setMedication] = useState(initialValues?.medication ?? '')
  const [dose, setDose] = useState(initialValues?.dose ?? '')
  const defaultPreset = initialValues?.interval_hours
    ? (INTERVAL_PRESETS.some((p) => p.value === String(initialValues.interval_hours))
        ? String(initialValues.interval_hours)
        : 'other')
    : '8'
  const [intervalPreset, setIntervalPreset] = useState(defaultPreset)
  const [customInterval, setCustomInterval] = useState(
    defaultPreset === 'other' && initialValues?.interval_hours
      ? String(initialValues.interval_hours)
      : '',
  )
  const [durationDays, setDurationDays] = useState(
    initialValues?.duration_days ? String(initialValues.duration_days) : '',
  )
  const [visitId, setVisitId] = useState('')

  const effectiveSubject = childId ? `child:${childId}` : selectedSubject
  const isChild = effectiveSubject.startsWith('child:')
  const effectiveChildId = isChild ? effectiveSubject.slice(6) : null
  const effectiveMemberId = !isChild && effectiveSubject.startsWith('member:') ? effectiveSubject.slice(7) : null

  const childVisits = effectiveChildId
    ? visits.filter((v) => v.child_id === effectiveChildId).slice(0, 3)
    : []

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const interval =
      intervalPreset === 'other' ? Number(customInterval) : Number(intervalPreset)
    if (!medication.trim() || !dose.trim() || !interval || !Number(durationDays)) return

    if (isEditMode && onUpdate) {
      const patch: PautaUpdateInput = {}
      if (medication.trim() !== initialValues.medication) patch.medication = medication.trim()
      if (dose.trim() !== initialValues.dose) patch.dose = dose.trim()
      if (interval !== initialValues.interval_hours) patch.interval_hours = interval
      if (Number(durationDays) !== initialValues.duration_days) patch.duration_days = Number(durationDays)
      onUpdate(Object.keys(patch).length > 0 ? patch : {
        medication: medication.trim(),
        dose: dose.trim(),
        interval_hours: interval,
        duration_days: Number(durationDays),
      })
      return
    }

    if (!effectiveChildId && !effectiveMemberId) return
    if (effectiveChildId) {
      onSubmit({
        child_id: effectiveChildId,
        medication: medication.trim(),
        dose: dose.trim(),
        interval_hours: interval,
        duration_days: Number(durationDays),
        health_visit_id: visitId || null,
      })
    } else {
      onSubmit({
        member_id: effectiveMemberId!,
        medication: medication.trim(),
        dose: dose.trim(),
        interval_hours: interval,
        duration_days: Number(durationDays),
      })
    }
  }

  // Cuando se pasa `defaultSubject`, siempre mostrar el select para
   // permitir preseleccionar un sujeto específico (caso de detalle de Miembro).
   const showSubjectSelector = !childId && !isEditMode || !!explicitDefaultSubject

   return (
     <form className="pauta-form" onSubmit={handleSubmit}>
       {showSubjectSelector && (
         <label className="pauta-form__label">
           Para quién
           <select
             className="pauta-form__input"
             value={selectedSubject}
             onChange={(e) => { setSelectedSubject(e.target.value); setVisitId('') }}
             required
           >
             {!singleSubject && <option value="">Seleccionar…</option>}
             <optgroup label="Hijos">
               {children.map((c) => (
                 <option key={c.id} value={`child:${c.id}`}>{c.name}</option>
               ))}
             </optgroup>
             <optgroup label="Miembros">
               {members.map((m) => (
                 <option key={m.id} value={`member:${m.id}`}>{m.display_name ?? m.id}</option>
               ))}
             </optgroup>
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

      {!isEditMode && isChild && effectiveChildId && childVisits.length > 0 && (
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
          {pending ? 'Guardando…' : isEditMode ? 'Guardar' : 'Registrar'}
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
