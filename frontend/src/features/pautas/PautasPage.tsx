import { useState } from 'react'
import { PAUTAS, childById, type MockPauta } from '../../lib/mock-data'
import './pautas.css'
import '../children/children.css'

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

function toneOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h + (ch.codePointAt(0) ?? 0)) % 6
  return h
}

function CheckSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ClockSmall() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg className={`pauta-card__chevron${open ? ' pauta-card__chevron--open' : ''}`} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function PulseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  )
}

function nextDoseTime(pauta: MockPauta): Date | null {
  if (pauta.status !== 'activa') return null
  const last = pauta.administraciones.at(-1)
  if (!last) return new Date(pauta.started_at)
  return new Date(new Date(last.given_at).getTime() + pauta.interval_hours * 3600_000)
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function PautaCard({ pauta }: { pauta: MockPauta }) {
  const [open, setOpen] = useState(false)
  const child = childById(pauta.child_id)
  const now = new Date()
  const startMs = new Date(pauta.started_at).getTime()
  const totalMs = pauta.duration_days * 86_400_000
  const elapsed = now.getTime() - startMs
  const dayNum = Math.min(Math.ceil(elapsed / 86_400_000), pauta.duration_days)
  const progress = Math.min((elapsed / totalMs) * 100, 100)

  const today = now.toISOString().slice(0, 10)
  const todayAdmins = pauta.administraciones.filter(
    (a) => a.given_at.slice(0, 10) === today,
  )
  const next = nextDoseTime(pauta)

  return (
    <div className={`pauta-card${pauta.status === 'finalizada' ? ' pauta-card--finalizada' : ''}`}>
      <div
        className="pauta-card__header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open) } }}
      >
        {child && (
          <span className="pauta-card__child">
            <span className="hijo-mono" data-tone={toneOf(child.name)}>
              {initialOf(child.name)}
            </span>
          </span>
        )}
        <div className="pauta-card__info">
          <span className="pauta-card__med">
            {pauta.medication} · {pauta.dose}
          </span>
          <span className="pauta-card__sub">
            {child?.name} · cada {pauta.interval_hours}h · {pauta.duration_days} días
          </span>
        </div>
        <span className={`pauta-card__status pauta-card__status--${pauta.status}`}>
          {pauta.status === 'activa' ? 'Activa' : 'Finalizada'}
        </span>
        <ChevronDown open={open} />
      </div>

      {open && (
        <div className="pauta-body">
          {/* Progress */}
          <div className="pauta-progress">
            <span className="pauta-progress__label ds-nums">
              Día {dayNum} de {pauta.duration_days}
            </span>
            <div className="pauta-progress__bar">
              <div className="pauta-progress__fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Today's tomas */}
          {pauta.status === 'activa' && (
            <div className="pauta-tomas">
              <span className="pauta-tomas__title">Tomas de hoy</span>
              {todayAdmins.map((adm) => (
                <div className="pauta-toma" key={adm.id}>
                  <span className="pauta-toma__time ds-nums">
                    {formatTime(new Date(adm.given_at))}
                  </span>
                  <span className="pauta-toma__label">Dada por {adm.given_by}</span>
                  <span className="pauta-toma__status pauta-toma__status--dada">
                    <CheckSmall /> Dada
                  </span>
                </div>
              ))}
              {next && (
                <div className="pauta-toma">
                  <span className="pauta-toma__time ds-nums">{formatTime(next)}</span>
                  <span className="pauta-toma__label">Próxima toma</span>
                  <span className="pauta-toma__status pauta-toma__status--proxima">
                    <ClockSmall /> Próxima
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          {pauta.status === 'activa' && (
            <div className="pauta-body__actions">
              <button type="button" className="btn btn--primary btn--sm">
                Marcar toma
              </button>
              <button type="button" className="btn btn--secondary btn--sm">
                Finalizar Pauta
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function PautasPage() {
  const sorted = [...PAUTAS].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'activa' ? -1 : 1
    const nextA = nextDoseTime(a)
    const nextB = nextDoseTime(b)
    if (nextA && nextB) return nextA.getTime() - nextB.getTime()
    return 0
  })

  return (
    <div className="pautas" aria-labelledby="pautas-title">
      <h1 className="pautas__title" id="pautas-title">Pautas</h1>

      {sorted.length === 0 ? (
        <div className="pautas__empty">
          <span className="pautas__empty-icon" aria-hidden="true"><PulseIcon /></span>
          <p className="pautas__empty-title">Sin pautas activas</p>
          <p className="pautas__empty-text">
            Cuando registres un tratamiento (por voz o desde una visita), aparecerá aquí con sus tomas y progreso.
          </p>
        </div>
      ) : (
        <ul className="pautas__list">
          {sorted.map((p) => (
            <li key={p.id}><PautaCard pauta={p} /></li>
          ))}
        </ul>
      )}
    </div>
  )
}
