import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { apiFetch } from '../../lib/api'

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

function keysMatch(
  existingKey: ArrayBuffer | null,
  currentKey: Uint8Array
): boolean {
  if (!existingKey) return false

  const existingArray = new Uint8Array(existingKey)

  if (existingArray.length !== currentKey.length) return false

  for (let i = 0; i < existingArray.length; i++) {
    if (existingArray[i] !== currentKey[i]) return false
  }

  return true
}

export function usePushNotifications() {
  const { getToken } = useAuth()
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 1. Check inicial: ¿hay suscripción?
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

  // 2. Self-healing: reparar automáticamente si es necesario
  // Solo se ejecuta si el usuario tiene el check activado (enabled = true)
  useEffect(() => {
    async function selfHeal() {
      // Solo si el usuario TIENE el check activado
      if (!enabled) return

      // Verificar permiso
      if (Notification.permission !== 'granted') return

      if (!('serviceWorker' in navigator)) return

      try {
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()

        if (!sub) {
          // No hay suscripción local → intenta suscribir automáticamente
          try {
            const token = await getToken()
            const { vapid_public_key } = await apiFetch<{ vapid_public_key: string }>(
              '/api/push/vapid-public-key',
              { token, method: 'GET' },
            )

            const newSub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(vapid_public_key),
            })

            const subJson = newSub.toJSON()
            await apiFetch('/api/push/subscribe', {
              token,
              method: 'POST',
              body: {
                endpoint: subJson.endpoint,
                p256dh: subJson.keys?.p256dh ?? '',
                auth: subJson.keys?.auth ?? '',
              },
            })

            // ✅ Recuperado exitosamente
            console.log('Self-healing: suscripción creada')
          } catch (e) {
            // Falló → desactivar el check para que el usuario sepa
            console.error('Self-healing falló:', e)
            setEnabled(false)
            setError('Las notificaciones se desactivaron automáticamente. Inténtalo de nuevo.')
          }
          return
        }

        // Hay suscripción local → verificar si VAPID coincide
        try {
          const token = await getToken()
          const { vapid_public_key } = await apiFetch<{ vapid_public_key: string }>(
            '/api/push/vapid-public-key',
            { token, method: 'GET' },
          )
          const currentKey = urlBase64ToUint8Array(vapid_public_key)
          const existingKey = sub.getKey('p256dh')

          if (!keysMatch(existingKey, currentKey)) {
            // VAPID cambió → re-registrar en silencio
            await sub.unsubscribe()

            const newSub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: currentKey,
            })

            const subJson = newSub.toJSON()
            await apiFetch('/api/push/subscribe', {
              token,
              method: 'POST',
              body: {
                endpoint: subJson.endpoint,
                p256dh: subJson.keys?.p256dh ?? '',
                auth: subJson.keys?.auth ?? '',
              },
            })

            console.log('Self-healing: VAPID actualizado')
          }
        } catch (e) {
          console.error('Verificación de VAPID falló:', e)
        }
      } catch (e) {
        console.error('Self-healing falló:', e)
      }
    }

    selfHeal()
  }, [enabled, getToken])

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

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid_public_key),
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