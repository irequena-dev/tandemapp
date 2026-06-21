import { useCallback } from 'react'
import type { ReactNode } from 'react'
import { useToast } from './useToast'

/**
 * Hook especializado para toasts de acción "Deshacer".
 * Retorna una función que muestra un toast con botón de deshacer que cierra el toast automáticamente.
 */
export function useUndoToast() {
  const toast = useToast()

  const showUndoToast = useCallback(
    (
      tone: 'success' | 'info',
      message: ReactNode,
      undoAction: () => void,
      options?: { duration?: number }
    ) => {
      const toastId = toast.info(
        <>
          {message}{' '}
          <button
            type="button"
            className="toast__action"
            onClick={() => {
              undoAction()
              toast.dismiss(toastId)
            }}
          >
            Deshacer
          </button>
        </>,
        {
          duration: options?.duration ?? 6000,
        }
      )

      return toastId
    },
    [toast]
  )

  return { showUndoToast }
}
