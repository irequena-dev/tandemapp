import { Link } from 'react-router'
import { useChildren } from '../children/api'
import { PautaCard } from './PautaCard'
import { usePautas } from './api'
import './pautas.css'
import '../children/children.css'

function PulseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  )
}

export function PautasPage() {
  const { data: pautas = [], isLoading } = usePautas()
  const { data: children = [] } = useChildren()

  const childNameById = (id: string): string => {
    const child = children.find((c) => c.id === id)
    return child?.name ?? '…'
  }

  const sorted = [...pautas].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    if (a.next_dose_at && b.next_dose_at) {
      return new Date(a.next_dose_at).getTime() - new Date(b.next_dose_at).getTime()
    }
    return 0
  })

  // Solo mostramos Pautas activas. El historial de finalizadas vive en el tab Pautas de HijoDetail.
  const active = sorted.filter((p) => p.status === 'active')

  if (isLoading) {
    // Skeleton espejo del `.hijo-skel-row` de Hijos: mono + dos líneas pulsando,
    // no "Cargando…" en texto pelado. Dos filas bastan para anticipar la lista.
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

      {active.length === 0 ? (
        <div className="pautas__empty">
          <span className="pautas__empty-icon" aria-hidden="true"><PulseIcon /></span>
          <p className="pautas__empty-title">Sin pautas activas</p>
          <p className="pautas__empty-text">
            Cuando registres un tratamiento (por voz o desde una visita), aparecerá aquí con sus tomas y progreso.
          </p>
          {/* Sembrar una acción (como hace Hijos): una Pauta nace de una Visita
              médica en la ficha de un Hijo. No hay formulario aquí a propósito
              — la entrada habitual es por voz — así que apuntamos al camino real
              en vez de dejar un callejón sin salida. */}
          <Link className="btn btn--secondary btn--sm" to="/hijos">Ver los Hijos</Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <ul className="pautas__list pautas__group">
              {active.map((p) => (
                <li key={p.id}><PautaCard pauta={p} childName={childNameById(p.child_id)} /></li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
