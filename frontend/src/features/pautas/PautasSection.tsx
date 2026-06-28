import { useState } from 'react'
import { useCreatePauta } from './api'
import { PautaCard } from './PautaCard'
import { PautaForm } from './PautaForm'
import { useToast } from '../toasts/useToast'
import type { Child } from '../children/types'
import type { HealthVisit } from '../health-visits/types'
import type { Member } from '../members/types'
import type { Pauta, PautaInput } from './types'

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

type PautasSectionProps = {
  subjectId: string
  subjectType: 'child' | 'member'
  subjectName: string
  pautas: Pauta[]
  visits: HealthVisit[]
  children: Child[]
  members: Member[]
}

export function PautasSection({
  subjectId,
  subjectType,
  subjectName,
  pautas,
  visits,
  children,
  members,
}: PautasSectionProps) {
  const [showForm, setShowForm] = useState(false)
  const createMut = useCreatePauta()
  const toast = useToast()

  const handleCreate = (input: PautaInput) => {
    createMut.mutate(input, {
      onSuccess: (data) => {
        toast.success(`Pauta de ${data.medication} creada`)
        setShowForm(false)
      },
      onError: () => toast.error('No se pudo crear la pauta'),
    })
  }

  // Filtrar Pautas por sujeto
  const subjectPautas = subjectType === 'child'
    ? pautas.filter((p) => p.child_id === subjectId)
    : pautas.filter((p) => p.member_id === subjectId)

  const active = subjectPautas.filter((p) => p.status === 'active')
  const finished = subjectPautas.filter((p) => p.status === 'finished')

  // Ordenar activas por próxima toma
  const sortedActive = [...active].sort((a, b) => {
    if (a.next_dose_at && b.next_dose_at) {
      return new Date(a.next_dose_at).getTime() - new Date(b.next_dose_at).getTime()
    }
    return 0
  })

  // Ordenar finalizadas por fecha de finalización (más recientes primero)
  const sortedFinished = [...finished].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return (
    <section className="hijo-detail__section">
      <div className="hijo-detail__section-header">
        <h2 className="hijo-detail__section-title">Pautas</h2>
        {!showForm && (
          <button
            type="button"
            className="hijo-detail__add-btn"
            onClick={() => setShowForm(true)}
            aria-label="Registrar pauta"
          >
            <PlusIcon /> Pauta
          </button>
        )}
      </div>

      {showForm && (
         <PautaForm
           childId={subjectType === 'child' ? subjectId : undefined}
           children={children}
           members={members}
           visits={visits}
           onSubmit={handleCreate}
           onCancel={() => setShowForm(false)}
           pending={createMut.isPending}
           defaultSubject={
             subjectType === 'child'
               ? `child:${subjectId}`
               : `member:${subjectId}`
           }
         />
       )}

      {subjectPautas.length === 0 && !showForm ? (
        <div className="hijo-detail__empty">
          <p>{subjectName} no tiene pautas registradas</p>
        </div>
      ) : (
        <>
          {/* Activas */}
          <div className="pautas-section">
            <h3 className="pautas-section__title">Activas</h3>
            {sortedActive.length > 0 ? (
              <ul className="pautas__list">
                {sortedActive.map((p) => (
                  <li key={p.id}>
                    <PautaCard pauta={p} subjectName={subjectName} showSubject={false} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hijo-detail__empty hijo-detail__empty--compact">
                <p>Sin pautas activas para {subjectName}</p>
              </div>
            )}
          </div>

          {/* Finalizadas - colapsable por defecto */}
          {sortedFinished.length > 0 && (
            <details className="pautas-section__group" open={false}>
              <summary className="pautas-section__summary">
                Finalizadas ({sortedFinished.length})
              </summary>
              <ul className="pautas__list">
                {sortedFinished.map((p) => (
                  <li key={p.id}>
                    <PautaCard pauta={p} subjectName={subjectName} showSubject={false} />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  )
}
