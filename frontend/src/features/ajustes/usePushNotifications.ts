import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

export function usePushNotifications() {
  const { getToken } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        if (
          typeof Notification === 'undefined' ||
          Notification.permission !== 'granted' ||
          !('serviceWorker' in navigator)
        ) {
          if (!cancelled) {
            setEnabled(false)
            setLoading(false)
          }
          return
        }

        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (!cancelled) {
          setEnabled(sub !== null)
          setLoading(false)
        }
      } catch {
        if (!cancelled) {
          setEnabled(false)
          setLoading(false)
        }
      }
    }

    check()
    return () => {
      cancelled = true
    }
  }, [])

  const toggle = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const token = await getToken()

    if (enabled) {
      // Desactivar
      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          const endpoint = sub.endpoint
          await sub.unsubscribe()
          await apiFetch('/api/push/unsubscribe', {
            token,
            method: 'POST',
            body: { endpoint },
          })
        }
        setEnabled(false)
      } catch {
        setError('No se pudo desactivar. Inténtalo de nuevo.')
      } finally {
        setBusy(false)
      }
    } else {
      // Activar
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          setError('Permiso de notificaciones denegado.')
          return
        }

        const { vapid_public_key } = await apiFetch<{ vapid_public_key: string }>(
          '/api/push/vapid-public-key',
          { token, method: 'GET' },
        )

        const reg = await navigator.serviceWorker.ready

        // Limpiar suscripción local previa antes de crear una nueva
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          await existing.unsubscribe()
          await apiFetch('/api/push/unsubscribe', {
            token,
            method: 'POST',
            body: { endpoint: existing.endpoint },
          })
        }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid_public_key) as BufferSource,
        })

        const subJson = sub.toJSON()
        await apiFetch('/api/push/subscribe', {
          token,
          method: 'POST',
          body: {
            endpoint: subJson.endpoint,
            p256dh: subJson.keys?.p256dh ?? '',
            auth: subJson.keys?.auth ?? '',
          },
        })

        setEnabled(true)
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e)
        setError(`No se pudo activar: ${errMsg}`)
      } finally {
        setBusy(false)
      }
    }
  }, [enabled, getToken, busy])

  return { enabled, loading, busy, error, toggle }
}
