import { Link, useParams } from 'react-router'
import { childById, medidasForChild, visitasForChild } from '../../lib/mock-data'
import { formatAge } from '../children/age'
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

export function HijoDetailPage() {
  const { childId } = useParams<{ childId: string }>()
  const child = childId ? childById(childId) : undefined
  const medidas = childId ? medidasForChild(childId) : []
  const visitas = childId ? visitasForChild(childId) : []

  if (!child) {
    return (
      <div className="hijo-detail">
        <Link to="/hijos" className="hijo-detail__back"><ArrowLeft /> Hijos</Link>
        <div className="hijo-detail__empty">Hijo no encontrado</div>
      </div>
    )
  }

  const sortedMedidas = [...medidas].sort(
    (a, b) => b.recorded_at.localeCompare(a.recorded_at),
  )
  const sortedVisitas = [...visitas].sort(
    (a, b) => b.date.localeCompare(a.date),
  )

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
            {child.height_cm && (
              <span className="hijo-card__metric">
                <span className="hijo-card__metric-value">{child.height_cm} cm</span>
                <span className="hijo-card__metric-label">Altura</span>
              </span>
            )}
            {child.weight_kg && (
              <span className="hijo-card__metric">
                <span className="hijo-card__metric-value">{child.weight_kg} kg</span>
                <span className="hijo-card__metric-label">Peso</span>
              </span>
            )}
            {child.talla_calzado && (
              <span className="hijo-card__metric">
                <span className="hijo-card__metric-value">{child.talla_calzado}</span>
                <span className="hijo-card__metric-label">Calzado</span>
              </span>
            )}
            {child.talla_ropa && (
              <span className="hijo-card__metric">
                <span className="hijo-card__metric-value">{child.talla_ropa}</span>
                <span className="hijo-card__metric-label">Ropa</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Crecimiento */}
      <section className="hijo-detail__section">
        <h2 className="hijo-detail__section-title">Crecimiento</h2>
        {sortedMedidas.length === 0 ? (
          <div className="hijo-detail__empty">
            Aún no hay medidas registradas. Dicta una medida por voz o regístrala aquí.
          </div>
        ) : (
          <ul className="hijo-detail__growth">
            {sortedMedidas.map((m) => (
              <li className="growth-row" key={m.id}>
                <span className="growth-row__date">{formatDate(m.recorded_at)}</span>
                <span className="growth-row__value ds-nums">{m.value} {m.unit}</span>
                <span className="growth-row__type">
                  {m.type === 'height' ? 'Altura' : 'Peso'}
                </span>
              </li>
            ))}
          </ul>
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
