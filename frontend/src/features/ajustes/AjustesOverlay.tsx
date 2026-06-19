import { type FormEvent, useEffect, useState } from 'react'
import { UserButton } from '@clerk/react'
import { useMembers, useInvitations, useCreateInvitation, useRevokeInvitation } from '../members/api'
import { useChildrenWithMetrics, useCreateChild } from '../children/api'
import { ChildForm } from '../children/ChildForm'
import { ChildList } from '../children/ChildList'
import { useMcpTokens, useCreateMcpToken, useRevokeMcpToken } from '../mcp-tokens/api'
import type { McpTokenCreated } from '../mcp-tokens/types'
import { copyToClipboard } from '../../lib/clipboard'
import { useTheme, type Theme } from './useTheme'
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
  const [theme, setTheme] = useTheme()
  const [showInviteForm, setShowInviteForm] = useState(false)

  const { data: members = [] } = useMembers()
  const { data: invitations = [] } = useInvitations()
  const revokeInvitation = useRevokeInvitation()

  // Hijos: gestión real (alta/editar/borrar) conectada a la API.
  const { data: children = [], isPending: childrenPending } = useChildrenWithMetrics()
  const createChild = useCreateChild()
  const [addingChild, setAddingChild] = useState(false)
  // Remontar el formulario tras un alta correcta limpia sus campos.
  const [childFormKey, setChildFormKey] = useState(0)

  // Token MCP: ciclo de vida real (generar + revocar) conectado a la API.
  const { data: tokens = [], isPending: tokensPending } = useMcpTokens()
  const createToken = useCreateMcpToken()
  const revokeToken = useRevokeMcpToken()
  // El valor en claro se revela una sola vez al generar; luego solo metadata.
  const [revealedToken, setRevealedToken] = useState<McpTokenCreated | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const handleGenerateToken = () => {
    createToken.mutate(undefined, {
      onSuccess: (created) => {
        setRevealedToken(created)
        setTokenCopied(false)
      },
    })
  }

  const handleCopyToken = async () => {
    if (!revealedToken) return
    const ok = await copyToClipboard(revealedToken.token)
    setTokenCopied(ok)
  }

  const handleRevokeToken = (id: string) => {
    revokeToken.mutate(id, { onSuccess: () => setRevokingId(null) })
  }

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

          {/* Hijos — gestión real (alta/editar/borrar) */}
          <section className="ajustes-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h3 className="ajustes-section__title">Hijos</h3>
              {!addingChild && (
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => setAddingChild(true)}
                >
                  Añadir Hijo
                </button>
              )}
            </div>
            <p className="ajustes-section__desc">
              Identidad de los Hijos de la Familia. Los datos de crecimiento y visitas se gestionan en cada ficha.
            </p>

            {addingChild && (
              <div className="ajustes-card ajustes-card--form" style={{ marginBottom: 'var(--ds-s-sm)' }}>
                <ChildForm
                  key={childFormKey}
                  submitLabel="Añadir"
                  pending={createChild.isPending}
                  hasError={createChild.isError}
                  onSubmit={(input) =>
                    createChild.mutate(input, {
                      onSuccess: () => {
                        setAddingChild(false)
                        setChildFormKey((k) => k + 1)
                      },
                    })
                  }
                  onCancel={() => setAddingChild(false)}
                />
              </div>
            )}

            {children.length > 0 ? (
              <ChildList items={children} />
            ) : childrenPending ? (
              <p className="ajustes-section__desc" style={{ color: 'var(--ds-muted)' }}>
                Cargando Hijos…
              </p>
            ) : (
              <p className="ajustes-section__desc" style={{ color: 'var(--ds-muted)' }}>
                Aún no hay Hijos. Añade al primero para empezar.
              </p>
            )}
          </section>

          {/* Token MCP — generar y revocar (conectado a la API) */}
          <section className="ajustes-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <h3 className="ajustes-section__title">Token MCP</h3>
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={handleGenerateToken}
                disabled={createToken.isPending}
              >
                {createToken.isPending ? 'Generando…' : 'Generar token'}
              </button>
            </div>
            <p className="ajustes-section__desc">
              Conecta Claude para dictar datos por voz. El valor del token se muestra una sola vez al
              generarlo: cópialo y guárdalo en un sitio seguro.
            </p>

            {revealedToken && (
              <div className="ajustes-token" role="status" aria-live="polite">
                <span className="ajustes-row__name">Tu token (se muestra una sola vez)</span>
                <code className="ajustes-token__value">{revealedToken.token}</code>
                <div style={{ display: 'flex', gap: 'var(--ds-s-sm)' }}>
                  <button type="button" className="btn btn--secondary btn--sm" onClick={handleCopyToken}>
                    {tokenCopied ? 'Copiado' : 'Copiar'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setRevealedToken(null)}
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}

            {tokens.length > 0 ? (
              <div className="ajustes-card">
                {tokens.map((t) => {
                  const active = t.revoked_at === null
                  return (
                    <div className="ajustes-row" key={t.id}>
                      <div className="ajustes-row__text">
                        <span className="ajustes-row__name">{active ? 'Token activo' : 'Token revocado'}</span>
                        <span className="ajustes-row__role">Creado: {new Date(t.created_at).toLocaleString()}</span>
                      </div>
                      {active && (
                        <div className="ajustes-row__actions">
                          {revokingId === t.id ? (
                            <div style={{ display: 'flex', gap: 'var(--ds-s-sm)', alignItems: 'center' }}>
                              <span className="ajustes-row__role">¿Revocar?</span>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={() => handleRevokeToken(t.id)}
                                disabled={revokeToken.isPending}
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                onClick={() => setRevokingId(null)}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--secondary btn--sm"
                              onClick={() => setRevokingId(t.id)}
                            >
                              Revocar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : tokensPending ? (
              <p className="ajustes-section__desc" style={{ color: 'var(--ds-muted)' }}>
                Cargando tokens…
              </p>
            ) : (
              <p className="ajustes-section__desc" style={{ color: 'var(--ds-muted)' }}>
                No tienes tokens. Genera uno para conectar Claude.
              </p>
            )}
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
            <div className="ajustes-cuenta">
              <UserButton
                appearance={{
                  elements: {
                    rootBox: 'ajustes-clerk-root',
                    avatarBox: 'ajustes-clerk-avatar',
                  },
                }}
                showName
              />
            </div>
          </section>
        </div>
      </aside>
    </>
  )
}
