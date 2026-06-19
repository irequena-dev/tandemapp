import { useState } from 'react'
import { useChildren } from '../children/api'
import { useCreateAdministration, useDeleteAdministration, useFinishPauta, usePautas } from './api'
import type { Pauta } from './types'
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Ventana de la guarda de duplicado del backend (DUPLICATE_GUARD_MINUTES).
 * Si la última toma cae dentro, el POST devuelve la existente con 200 (no
 * crea nada nuevo): bloqueamos el botón aquí para evitar el no-op silencioso.
 */
const DUPLICATE_GUARD_MINUTES = 15

/** ¿La toma dada está dentro de la ventana de duplicado respecto a `now`? */
function isRecentAdmin(iso: string, now: Date): boolean {
  return now.getTime() - new Date(iso).getTime() < DUPLICATE_GUARD_MINUTES * 60_000
}

function PautaCard({ pauta, childName }: { pauta: Pauta; childName: string }) {
  const [open, setOpen] = useState(false)
  const finishMutation = useFinishPauta()
  const createAdmin = useCreateAdministration()
  const deleteAdmin = useDeleteAdministration()
  const now = new Date()
  const startMs = new Date(pauta.started_at).getTime()
  const totalMs = pauta.duration_days * 86_400_000
  const elapsed = now.getTime() - startMs
  const progress = Math.min((elapsed / totalMs) * 100, 100)

  const todaysAdmins = pauta.todays_administrations ?? []
  const lastAdmin = todaysAdmins.length > 0 ? todaysAdmins[todaysAdmins.length - 1] : null
  // La última toma de hoy determina si estamos dentro de la guarda de duplicado.
  const recentToma = lastAdmin !== null && isRecentAdmin(lastAdmin.administered_at, now)

  return (
    <div className={`pauta-card${pauta.status === 'finished' ? ' pauta-card--finalizada' : ''}`}>
      <div
        className="pauta-card__header"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open) } }}
      >
        <span className="pauta-card__child">
          <span className="hijo-mono" data-tone={toneOf(childName)}>
            {initialOf(childName)}
          </span>
        </span>
        <div className="pauta-card__info">
          <span className="pauta-card__med">
            {pauta.medication} · {pauta.dose}
          </span>
          <span className="pauta-card__sub">
            {childName} · cada {pauta.interval_hours}h · {pauta.duration_days} días
          </span>
        </div>
        <span className={`pauta-card__status pauta-card__status--${pauta.status === 'active' ? 'activa' : 'finalizada'}`}>
          {pauta.status === 'active' ? 'Activa' : 'Finalizada'}
        </span>
        <ChevronDown open={open} />
      </div>

      {open && (
        <div className="pauta-body">
          {/* Progress */}
          <div className="pauta-progress">
            <span className="pauta-progress__label ds-nums">
              Día {pauta.day_number} de {pauta.duration_days}
            </span>
            <div className="pauta-progress__bar">
              <div className="pauta-progress__fill" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Tomas del día */}
          {pauta.status === 'active' && (
            <div className="pauta-tomas">
              <span className="pauta-tomas__title">Tomas de hoy</span>

              {todaysAdmins.map((a) => (
                <div className="pauta-toma" key={a.id}>
                  <span className="pauta-toma__time ds-nums">
                    {formatTime(a.administered_at)}
                  </span>
                  <span className="pauta-toma__label">
                    Dada{a.member_name ? ` por ${a.member_name}` : ''}
                  </span>
                  <span className="pauta-toma__status pauta-toma__status--dada">
                    <CheckSmall /> Dada
                  </span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--xs"
                    aria-label="Deshacer toma"
                    onClick={() => deleteAdmin.mutate({ pautaId: pauta.id, adminId: a.id })}
                  >
                    Deshacer
                  </button>
                </div>
              ))}

              {/* Próxima toma */}
              {pauta.next_dose_at && (
                <div className="pauta-toma">
                  <span className="pauta-toma__time ds-nums">
                    {formatTime(pauta.next_dose_at)}
                  </span>
                  <span className="pauta-toma__label">Siguiente toma</span>
                  <span className="pauta-toma__status pauta-toma__status--proxima">
                    <ClockSmall /> Próxima
                  </span>
                </div>
              )}

              {todaysAdmins.length === 0 && !pauta.next_dose_at && (
                <p className="pauta-toma__label">Sin tomas registradas hoy</p>
              )}
            </div>
          )}

          {/* Última toma */}
          {lastAdmin && (
            <div className="pauta-tomas">
              <span className="pauta-tomas__title">Última toma</span>
              <div className="pauta-toma">
                <span className="pauta-toma__time ds-nums">
                  {formatTime(lastAdmin.administered_at)}
                </span>
                <span className="pauta-toma__label">
                  {lastAdmin.member_name ?? 'Miembro'}
                </span>
              </div>
            </div>
          )}

          {/* Ends at */}
          <div className="pauta-tomas">
            <span className="pauta-tomas__title">Fin del tratamiento</span>
            <div className="pauta-toma">
              <span className="pauta-toma__time ds-nums">
                {new Date(pauta.ends_at).toLocaleDateString('es-ES')}
              </span>
              <span className="pauta-toma__label">
                {pauta.status === 'finished' ? (
                  <><CheckSmall /> Finalizada</>
                ) : (
                  <><ClockSmall /> En curso</>
                )}
              </span>
            </div>
          </div>

          {/* Actions */}
          {pauta.status === 'active' && (
            <div className="pauta-body__actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => createAdmin.mutate(pauta.id)}
                disabled={createAdmin.isPending || recentToma}
                title={
                  recentToma && lastAdmin
                    ? `Ya hay una toma reciente (${formatTime(lastAdmin.administered_at)})`
                    : undefined
                }
              >
                Marcar toma
              </button>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => finishMutation.mutate(pauta.id)}
                disabled={finishMutation.isPending}
              >
                Finalizar Pauta
              </button>
              {recentToma && lastAdmin && (
                <span className="pauta-toma__hint">
                  Toma reciente a las {formatTime(lastAdmin.administered_at)} · espera {DUPLICATE_GUARD_MINUTES} min entre tomas
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
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

  if (isLoading) {
    return (
      <div className="pautas" aria-labelledby="pautas-title">
        <h1 className="pautas__title" id="pautas-title">Pautas</h1>
        <p className="pautas__empty-text">Cargando…</p>
      </div>
    )
  }

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
            <li key={p.id}><PautaCard pauta={p} childName={childNameById(p.child_id)} /></li>
          ))}
        </ul>
      )}
    </div>
  )
}
