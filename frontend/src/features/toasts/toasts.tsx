/**
 * Sistema de toasts mínimo, sin dependencias, basado en los tokens de
 * DESIGN.md (`--ds-shadow-toast`, `--ds-z-toast`). Pensado para confirmaciones
 * efímeras: "Toma registrada", "Toma eliminada", o el aviso de un error de
 * mutación que el backend rechazó.
 *
 * Uso:
 *   const toast = useToast()
 *   toast.success('Dada a las 14:32 por Marta')
 *   toast.error('No se pudo registrar la toma')
 *
 * El `<ToastProvider />` se monta una sola vez (en main.tsx) y renderiza el
 * viewport vía portal en document.body, por encima de todo salvo tooltips.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import './toasts.css'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastOptions {
  /** Milisegundos antes del auto-cierre. Por defecto 4s; los errores duran 6s. */
  duration?: number
}

interface ToastRecord {
  id: number
  tone: ToastTone
  text: ReactNode
  leaving: boolean
}

interface ToastApi {
  success: (text: ReactNode, opts?: ToastOptions) => void
  error: (text: ReactNode, opts?: ToastOptions) => void
  info: (text: ReactNode, opts?: ToastOptions) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const DEFAULT_DURATION: Record<ToastTone, number> = {
  success: 4000,
  info: 4000,
  // El error suele pedir acción/lectura; le damos más aire.
  error: 6000,
}

function ToastGlyph({ tone }: { tone: ToastTone }) {
  if (tone === 'success') {
    return (
      <svg
        className="toast__icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  if (tone === 'error') {
    return (
      <svg
        className="toast__icon"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  }
  return (
    <svg
      className="toast__icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])
  // Llevamos los timers fuera de render para poder limpiarlos al desmontar.
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    // Fase de salida: deja que corra la animación antes de retirar del DOM.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    const leaveTimer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
      timers.current.delete(id)
    }, 120)
    // Reutilizamos el mismo mapa; el timer original ya disparó (es el que llama
    // a dismiss), así que registramos el de salida en su lugar.
    timers.current.set(id, leaveTimer)
  }, [])

  const push = useCallback(
    (tone: ToastTone, text: ReactNode, opts?: ToastOptions) => {
      const id = nextId.current++
      const duration = opts?.duration ?? DEFAULT_DURATION[tone]
      setToasts((prev) => [...prev, { id, tone, text, leaving: false }])
      const timer = setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (text, opts) => push('success', text, opts),
      error: (text, opts) => push('error', text, opts),
      info: (text, opts) => push('info', text, opts),
    }),
    [push],
  )

  // Limpieza al desmontar el provider: cancela cualquier timer pendiente para
  // que no intente actualizar estado tras el unmount.
  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((t) => clearTimeout(t))
      pending.clear()
    }
  }, [])

  if (typeof document === 'undefined') {
    return <ToastContext.Provider value={api}>{children}</ToastContext.Provider>
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          className="toast-viewport"
          role="region"
          aria-label="Notificaciones"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`toast toast--${t.tone}${t.leaving ? ' is-leaving' : ''}`}
              role={t.tone === 'error' ? 'alert' : 'status'}
            >
              <ToastGlyph tone={t.tone} />
              <span className="toast__text">{t.text}</span>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

/** Acceso al sistema de toasts. Debe usarse dentro de `<ToastProvider />`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>')
  }
  return ctx
}
