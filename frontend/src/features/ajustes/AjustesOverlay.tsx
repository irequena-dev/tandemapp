import { type FormEvent, useEffect, useState } from 'react'
import { useMembers, useInvitations, useCreateInvitation, useRevokeInvitation } from '../members/api'
import { CHILDREN } from '../../lib/mock-data'
import './ajustes.css'
import '../children/children.css'

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  )
}

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

function toneOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h + (ch.codePointAt(0) ?? 0)) % 6
  return h
}

type Theme = 'system' | 'light' | 'dark'

function InviteForm({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const createInvitation = useCreateInvitation()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    createInvitation.mutate(
      { email_address: trimmed },
      {
        onSuccess: () => {
          setEmail('')
          onClose()
        },
      },
    )
  }

  return (
    <form className="invite-form" onSubmit={handleSubmit}>
      <input
        type="email"
        className="invite-form__input"
        placeholder="Email de la persona a invitar"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoFocus
      />
      <div className="invite-form__actions">
        <button
          type="submit"
          className="btn btn--primary btn--sm"
          disabled={createInvitation.isPending}
        >
          {createInvitation.isPending ? 'Enviando…' : 'Enviar'}
        </button>
        <button type="button" className="btn btn--secondary btn--sm" onClick={onClose}>
          Cancelar
        </button>
      </div>
      {createInvitation.isError && (
        <p className="invite-form__error">No se pudo enviar la invitación.</p>
      )}
    </form>
  )
}

export function AjustesOverlay({ onClose }: { onClose: () => void }) {
  const [theme, setTheme] = useState<Theme>('system')
  const [showInviteForm, setShowInviteForm] = useState(false)

  const { data: members = [] } = useMembers()
  const { data: invitations = [] } = useInvitations()
  const revokeInvitation = useRevokeInvitation()

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <>
      <div className="ajustes-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="ajustes" role="dialog" aria-label="Ajustes" aria-modal="true">
        <div className="ajustes__header">
          <h2 className="ajustes__title ds-display">Ajustes</h2>
          <button type="button" className="ajustes__close" aria-label="Cerrar Ajustes" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        <div className="ajustes__content">
          {/* Familia */}
          <section className="ajustes-section">
            <h3 className="ajustes-section__title">Familia</h3>
            <div className="ajustes-card">
              <div className="ajustes-row">
                <div className="ajustes-row__text">
                  <span className="ajustes-row__name">Mi Familia</span>
                </div>
              </div>
            </div>
          </section>

          {/* Miembros */}
          <section className="ajustes-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h3 className="ajustes-section__title">Miembros</h3>
              {!showInviteForm && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setShowInviteForm(true)}
                >
                  Invitar
                </button>
              )}
            </div>

            {showInviteForm && (
              <InviteForm onClose={() => setShowInviteForm(false)} />
            )}

            <div className="ajustes-card">
              {members.map((m) => {
                const name = m.display_name ?? m.id
                return (
                  <div className="ajustes-row" key={m.id}>
                    <span className="hijo-mono" data-tone={toneOf(name)} aria-hidden="true">
                      {initialOf(name)}
                    </span>
                    <div className="ajustes-row__text">
                      <span className="ajustes-row__name">{name}</span>
                    </div>
                  </div>
                )
              })}
              {members.length === 0 && (
                <div className="ajustes-row">
                  <div className="ajustes-row__text">
                    <span className="ajustes-row__name" style={{ color: 'var(--ds-muted)' }}>
                      Cargando miembros…
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Invitaciones pendientes */}
            {invitations.length > 0 && (
              <div className="ajustes-card" style={{ marginTop: 'var(--ds-s-sm)' }}>
                <div className="ajustes-row" style={{ paddingBlock: 'var(--ds-s-sm)' }}>
                  <span className="ajustes-row__role" style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Invitaciones pendientes
                  </span>
                </div>
                {invitations.map((inv) => (
                  <div className="ajustes-row" key={inv.id}>
                    <span className="hijo-mono" data-tone={toneOf(inv.email_address)} aria-hidden="true">
                      ✉
                    </span>
                    <div className="ajustes-row__text">
                      <span className="ajustes-row__name">{inv.email_address}</span>
                      <span className="ajustes-row__role">Pendiente</span>
                    </div>
                    <div className="ajustes-row__actions">
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Revocar invitación a ${inv.email_address}`}
                        title="Revocar"
                        onClick={() => revokeInvitation.mutate(inv.id)}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Hijos */}
          <section className="ajustes-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h3 className="ajustes-section__title">Hijos</h3>
              <button type="button" className="btn btn--primary btn--sm">Añadir Hijo</button>
            </div>
            <p className="ajustes-section__desc">
              Identidad de los Hijos de la Familia. Los datos de crecimiento y visitas se gestionan en cada ficha.
            </p>
            <div className="ajustes-card">
              {CHILDREN.length === 0 ? (
                <div className="ajustes-row">
                  <div className="ajustes-row__text">
                    <span className="ajustes-row__name" style={{ color: 'var(--ds-muted)' }}>
                      Aún no hay Hijos. Añade al primero para empezar.
                    </span>
                  </div>
                </div>
              ) : (
                CHILDREN.map((c) => (
                  <div className="ajustes-row" key={c.id}>
                    <span className="hijo-mono" data-tone={toneOf(c.name)} aria-hidden="true">
                      {initialOf(c.name)}
                    </span>
                    <div className="ajustes-row__text">
                      <span className="ajustes-row__name">{c.name}</span>
                      <span className="ajustes-row__role">
                        {new Date(c.birth_date).toLocaleDateString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                    <div className="ajustes-row__actions">
                      <button type="button" className="icon-btn" aria-label={`Editar ${c.name}`} title="Editar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Token MCP */}
          <section className="ajustes-section">
            <h3 className="ajustes-section__title">Token MCP</h3>
            <p className="ajustes-section__desc">
              Conecta Claude para dictar datos por voz. Genera un token y configúralo en la app de Claude.
            </p>
            <div className="ajustes-token">
              <span className="ajustes-token__value">mcp_tk_••••••••••••••••</span>
              <div style={{ display: 'flex', gap: 'var(--ds-s-sm)' }}>
                <button type="button" className="btn btn--primary btn--sm">Generar nuevo</button>
                <button type="button" className="btn btn--secondary btn--sm">Revocar</button>
              </div>
            </div>
          </section>

          {/* Apariencia */}
          <section className="ajustes-section">
            <h3 className="ajustes-section__title">Apariencia</h3>
            <div className="ajustes-theme">
              {(['system', 'light', 'dark'] as Theme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`ajustes-theme__option${theme === t ? ' ajustes-theme__option--active' : ''}`}
                  onClick={() => setTheme(t)}
                >
                  {t === 'system' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
                    </svg>
                  )}
                  {t === 'light' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                    </svg>
                  )}
                  {t === 'dark' && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                    </svg>
                  )}
                  {t === 'system' ? 'Sistema' : t === 'light' ? 'Claro' : 'Oscuro'}
                </button>
              ))}
            </div>
          </section>

          {/* Cuenta */}
          <section className="ajustes-section">
            <h3 className="ajustes-section__title">Cuenta</h3>
            <div className="ajustes-card">
              <div className="ajustes-row">
                <span className="hijo-mono" data-tone={0} aria-hidden="true">A</span>
                <div className="ajustes-row__text">
                  <span className="ajustes-row__name">Ana Martínez</span>
                  <span className="ajustes-row__role">ana.martinez@email.com</span>
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--secondary" style={{ alignSelf: 'flex-start' }}>
              Cerrar sesión
            </button>
          </section>
        </div>
      </aside>
    </>
  )
}
