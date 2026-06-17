import { Link } from 'react-router'
import { CHILDREN } from '../../lib/mock-data'
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

function ChevronRight() {
  return (
    <svg className="hijo-card__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="3.2" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.3A4 4 0 0 1 16 11" />
    </svg>
  )
}

export function HijosTabPage() {
  if (CHILDREN.length === 0) {
    return (
      <div className="hijos-tab" aria-labelledby="hijos-tab-title">
        <h1 className="hijos-tab__title" id="hijos-tab-title">Hijos</h1>
        <div className="hijos-tab__empty">
          <span className="hijos-tab__empty-icon" aria-hidden="true"><PeopleIcon /></span>
          <p className="hijos-tab__empty-title">Aún no hay Hijos en la Familia</p>
          <p className="hijos-tab__empty-text">
            Ve a Ajustes para añadir a tu primer Hijo. Después podrás ver aquí sus medidas, tallas y visitas.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="hijos-tab" aria-labelledby="hijos-tab-title">
      <h1 className="hijos-tab__title" id="hijos-tab-title">Hijos</h1>
      <div className="hijos-tab__grid">
        {CHILDREN.map((child) => (
          <Link to={`/hijos/${child.id}`} className="hijo-card" key={child.id}>
            <span className="hijo-card__avatar">
              <span className="hijo-mono hijo-mono--lg" data-tone={toneOf(child.name)}>
                {initialOf(child.name)}
              </span>
            </span>
            <div className="hijo-card__info">
              <span className="hijo-card__name">{child.name}</span>
              <span className="hijo-card__age ds-nums">{formatAge(child.birth_date)}</span>
              <div className="hijo-card__metrics">
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
                {child.talla && (
                  <span className="hijo-card__metric">
                    <span className="hijo-card__metric-value">{child.talla}</span>
                    <span className="hijo-card__metric-label">Talla</span>
                  </span>
                )}
              </div>
            </div>
            <ChevronRight />
          </Link>
        ))}
      </div>
    </div>
  )
}
