import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export interface ToastOptions {
  /** Milisegundos antes del auto-cierre. Por defecto 4s; los errores duran 6s. */
  duration?: number
  /** Callback para cerrar el toast manualmente (útil para acciones como "Deshacer") */
  onDismiss?: () => void
}

export interface ToastApi {
  success: (text: ReactNode, opts?: ToastOptions) => number
  error: (text: ReactNode, opts?: ToastOptions) => number
  info: (text: ReactNode, opts?: ToastOptions) => number
  /** Cierra un toast específico por su ID (interno del sistema) */
  dismiss: (id: number) => void
}

/**
 * Contexto del sistema de toasts. Se define aquí (y no en `toasts.tsx`) para
 * que el archivo de componentes sólo exporte componentes y no rompa la regla
 * `react-refresh/only-export-components`.
 */
export const ToastContext = createContext<ToastApi | null>(null)

/** Acceso al sistema de toasts. Debe usarse dentro de `<ToastProvider />`. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>')
  }
  return ctx
}
