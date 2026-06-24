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
        // keep state
      }
    } else {
      // Activar
      try {
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        const { vapid_public_key } = await apiFetch<{ vapid_public_key: string }>(
          '/api/push/vapid-public-key',
          { token, method: 'GET' },
        )

        const reg = await navigator.serviceWorker.ready
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
      } catch {
        // keep state
      }
    }
  }, [enabled, getToken])

  return { enabled, loading, toggle }
}
