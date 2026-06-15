import { useState, type CSSProperties } from 'react'
import { useCreateMcpToken, useMcpTokens, useRevokeMcpToken } from './api'
import type { McpTokenCreated } from './types'

/**
 * Panel de Ajustes para el ciclo de vida del token MCP del Miembro (shell
 * funcional, sin estilar: estilos en línea sobre tokens `--ds`). El valor en
 * claro se muestra una sola vez al generar; el listado expone solo metadata y
 * permite revocar. El pase de diseño lo hace el usuario (igual que en la 03).
 */
export function McpTokenPanel() {
  const { data: tokens, isPending, isError, refetch } = useMcpTokens()
  const create = useCreateMcpToken()
  const revoke = useRevokeMcpToken()
  const [revealed, setRevealed] = useState<McpTokenCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const handleGenerate = () => {
    create.mutate(undefined, {
      onSuccess: (created) => {
        setRevealed(created)
        setCopied(false)
      },
    })
  }

  const handleCopy = async () => {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed.token)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main aria-labelledby="mcp-token-title" style={styles.shell}>
      <div>
        <h1 id="mcp-token-title" style={styles.title}>
          Token MCP
        </h1>
        <p style={styles.subtitle}>
          Conecta tu app de Claude con Tándem. El valor del token se muestra una
          sola vez al generarlo: cópialo y guárdalo en un sitio seguro.
        </p>
      </div>

      <button
        type="button"
        style={{ ...styles.btn, ...styles.btnPrimary }}
        onClick={handleGenerate}
        disabled={create.isPending}
      >
        {create.isPending ? 'Generando…' : 'Generar token'}
      </button>

      {revealed && (
        <section role="status" aria-live="polite" style={styles.revealed}>
          <p style={{ fontWeight: 600 }}>Tu token (se muestra una sola vez)</p>
          <code style={styles.tokenValue}>{revealed.token}</code>
          <div style={styles.row}>
            <button type="button" style={{ ...styles.btn, ...styles.btnSm, ...styles.btnSecondary }} onClick={handleCopy}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button type="button" style={{ ...styles.btn, ...styles.btnSm, ...styles.btnSecondary }} onClick={() => setRevealed(null)}>
              Listo
            </button>
          </div>
        </section>
      )}

      {isPending && <p style={{ color: 'var(--ds-muted)' }}>Cargando…</p>}

      {isError && (
        <div role="alert" style={styles.error}>
          <p>No se han podido cargar los tokens.</p>
          <button type="button" style={{ ...styles.btn, ...styles.btnSm, ...styles.btnSecondary }} onClick={() => refetch()}>
            Reintentar
          </button>
        </div>
      )}

      {tokens && tokens.length > 0 && (
        <ul style={styles.list}>
          {tokens.map((t) => {
            const active = t.revoked_at === null
            return (
              <li key={t.id} style={styles.tokenRow}>
                <div>
                  <p style={{ fontWeight: 600 }}>{active ? 'Token activo' : 'Token revocado'}</p>
                  <p style={styles.meta}>Creado: {new Date(t.created_at).toLocaleString()}</p>
                </div>
                {active &&
                  (confirmingId === t.id ? (
                    <div style={styles.row}>
                      <span style={{ fontSize: '0.875rem' }}>¿Revocar?</span>
                      <button
                        type="button"
                        style={{ ...styles.btn, ...styles.btnSm, ...styles.btnDanger }}
                        onClick={() =>
                          revoke.mutate(t.id, { onSuccess: () => setConfirmingId(null) })
                        }
                        disabled={revoke.isPending}
                      >
                        Sí
                      </button>
                      <button type="button" style={{ ...styles.btn, ...styles.btnSm, ...styles.btnSecondary }} onClick={() => setConfirmingId(null)}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button type="button" style={{ ...styles.btn, ...styles.btnSm, ...styles.btnSecondary }} onClick={() => setConfirmingId(t.id)}>
                      Revocar
                    </button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}

const styles = {
  shell: {
    maxWidth: '40rem',
    margin: '0 auto',
    padding: '2rem 1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  } as CSSProperties,
  title: { fontSize: '1.5rem', fontWeight: 600, margin: 0 } as CSSProperties,
  subtitle: {
    color: 'var(--ds-muted)',
    marginTop: '0.25rem',
    lineHeight: 1.5,
  } as CSSProperties,
  btn: {
    minHeight: '44px',
    padding: '0 1rem',
    border: 'none',
    borderRadius: 'var(--ds-r-md)',
    fontSize: '0.9375rem',
    fontWeight: 600,
    cursor: 'pointer',
  } as CSSProperties,
  btnSm: { minHeight: '40px', padding: '0 0.75rem', fontSize: '0.875rem' } as CSSProperties,
  btnPrimary: { background: 'var(--ds-primary)', color: 'var(--ds-on-primary)' } as CSSProperties,
  btnSecondary: { background: 'var(--ds-surface-2)', color: 'var(--ds-ink)' } as CSSProperties,
  btnDanger: { background: 'var(--ds-danger)', color: '#fff' } as CSSProperties,
  revealed: {
    background: 'var(--ds-surface)',
    border: '1px solid var(--ds-border)',
    borderRadius: 'var(--ds-r-lg)',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  } as CSSProperties,
  tokenValue: {
    wordBreak: 'break-all',
    background: 'var(--ds-surface-2)',
    padding: '0.5rem',
    borderRadius: 'var(--ds-r-md)',
    fontFamily: 'monospace',
  } as CSSProperties,
  row: { display: 'flex', gap: '0.5rem', alignItems: 'center' } as CSSProperties,
  error: {
    background: 'var(--ds-surface)',
    border: '1px solid var(--ds-danger)',
    borderRadius: 'var(--ds-r-lg)',
    padding: '1rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  } as CSSProperties,
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  } as CSSProperties,
  tokenRow: {
    background: 'var(--ds-surface)',
    border: '1px solid var(--ds-border)',
    borderRadius: 'var(--ds-r-lg)',
    padding: '0.75rem 1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  } as CSSProperties,
  meta: { color: 'var(--ds-muted)', fontSize: '0.875rem', margin: 0 } as CSSProperties,
}
