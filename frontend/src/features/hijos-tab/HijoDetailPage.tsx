import { Link, useParams } from 'react-router'
import { childById, medidasForChild, visitasForChild, type MockMedida } from '../../lib/mock-data'
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

/* ---------- Growth Chart (lightweight SVG) ---------- */

type GrowthChartProps = {
  medidas: MockMedida[]
  label: string
  unit: string
  color: string
}

function GrowthChart({ medidas, label, unit, color }: GrowthChartProps) {
  if (medidas.length < 2) return null

  const sorted = [...medidas].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  const values = sorted.map((m) => m.value)
  const dates = sorted.map((m) => new Date(m.recorded_at + 'T00:00:00'))

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
        {/* Y-axis labels */}
        <text x={PAD_X - 6} y={PAD_Y + 4} textAnchor="end" className="growth-chart__axis-label">
          {maxVal}
        </text>
        <text x={PAD_X - 6} y={PAD_Y + CHART_H + 4} textAnchor="end" className="growth-chart__axis-label">
          {minVal}
        </text>

        {/* Grid lines */}
        <line x1={PAD_X} y1={PAD_Y} x2={PAD_X + CHART_W} y2={PAD_Y} className="growth-chart__grid" />
        <line x1={PAD_X} y1={PAD_Y + CHART_H} x2={PAD_X + CHART_W} y2={PAD_Y + CHART_H} className="growth-chart__grid" />

        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill={color} />
        ))}

        {/* X-axis date labels */}
        {points.map((p, i) => (
          <text key={i} x={p.x} y={H - 4} textAnchor="middle" className="growth-chart__axis-label">
            {formatShortDate(p.date)}
          </text>
        ))}
      </svg>
    </div>
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
            {child.talla && (
              <span className="hijo-card__metric">
                <span className="hijo-card__metric-value">{child.talla}</span>
                <span className="hijo-card__metric-label">Talla</span>
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
          <>
            <GrowthChart
              medidas={medidas.filter((m) => m.type === 'height')}
              label="Altura"
              unit="cm"
              color="var(--ds-primary)"
            />
            <GrowthChart
              medidas={medidas.filter((m) => m.type === 'weight')}
              label="Peso"
              unit="kg"
              color="var(--ds-attention)"
            />
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
