import { useState } from 'react'
import { useChildren } from '../children/api'
import { useHealthVisits } from '../health-visits/api'
import { useMembers } from '../members/api'
import { useToast } from '../toasts/useToast'
import { PautaCard } from './PautaCard'
import { PautaForm } from './PautaForm'
import { useCreatePauta, usePautas } from './api'
import type { PautaInput } from './types'
import './pautas.css'
import '../children/children.css'

function PulseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

export function PautasPage() {
  const { data: pautas = [], isLoading } = usePautas()
  const { data: children = [] } = useChildren()
  const { data: members = [] } = useMembers()
  const [showCreate, setShowCreate] = useState(false)
  const createMut = useCreatePauta()
  const toast = useToast()

  // Fetch visits for the first child to populate the form select.
  // PautaForm filters by selected child internally.
  const firstChildId = children[0]?.id ?? ''
  const { data: visits = [] } = useHealthVisits(firstChildId)

  const handleCreate = (input: PautaInput) => {
    createMut.mutate(input, {
      onSuccess: (data) => {
        toast.success(`Pauta de ${data.medication} creada`)
        setShowCreate(false)
      },
      onError: () => toast.error('No se pudo crear la pauta'),
    })
  }

  const sorted = [...pautas].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    if (a.next_dose_at && b.next_dose_at) {
      return new Date(a.next_dose_at).getTime() - new Date(b.next_dose_at).getTime()
    }
    return 0
  })

  const active = sorted.filter((p) => p.status === 'active')

  if (isLoading) {
    return (
      <div className="pautas" aria-labelledby="pautas-title" aria-busy="true">
        <h1 className="pautas__title" id="pautas-title">Pautas</h1>
        <ul className="pautas__list" aria-hidden="true">
          <li><div className="pauta-skel"><span className="skel skel--mono" /><span className="skel skel--lines"><span className="skel skel--name" /><span className="skel skel--age" /></span></div></li>
          <li><div className="pauta-skel"><span className="skel skel--mono" /><span className="skel skel--lines"><span className="skel skel--name" /><span className="skel skel--age" /></span></div></li>
        </ul>
      </div>
    )
  }

  return (
    <div className="pautas" aria-labelledby="pautas-title">
      <h1 className="pautas__title" id="pautas-title">Pautas</h1>

      {showCreate && (
        <PautaForm
          children={children}
          members={members}
          visits={visits}
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
          pending={createMut.isPending}
        />
      )}

      {active.length === 0 ? (
        <div className="pautas__empty">
          <span className="pautas__empty-icon" aria-hidden="true"><PulseIcon /></span>
          <p className="pautas__empty-title">Sin pautas activas</p>
          <p className="pautas__empty-text">
            Pulsa + para registrar la primera pauta de un tratamiento.
          </p>
        </div>
      ) : (
        <ul className="pautas__list pautas__group">
          {active.map((p) => (
            <li key={p.id}><PautaCard pauta={p} subjectName={p.subject_name} /></li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className={`pautas__fab${showCreate ? ' pautas__fab--open' : ''}`}
        aria-label="Crear pauta"
        onClick={() => setShowCreate((v) => !v)}
      >
        {showCreate ? <XIcon /> : <PlusIcon />}
      </button>
    </div>
  )
}
