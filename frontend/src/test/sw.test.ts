/**
 * Tests para los handlers `push` y `notificationclick` del Service Worker.
 *
 * Simula el entorno global del SW (self, clients, registration) y verifica
 * que las notificaciones se muestran y que los clicks navegan correctamente.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* ---- Stub del entorno ServiceWorkerGlobalScope ---- */

let pushHandler: ((e: unknown) => void) | null = null
let notificationClickHandler: ((e: unknown) => void) | null = null

function makeWaitUntil() {
  const promises: Promise<unknown>[] = []
  return {
    waitUntil: (p: Promise<unknown>) => {
      promises.push(p)
    },
    flush: () => Promise.all(promises),
  }
}

beforeEach(() => {
  pushHandler = null
  notificationClickHandler = null

  // Stub self.addEventListener to capture handlers
  const listeners: Record<string, (e: unknown) => void> = {}
  vi.stubGlobal('self', {
    addEventListener: (type: string, handler: (e: unknown) => void) => {
      listeners[type] = handler
      if (type === 'push') pushHandler = handler
      if (type === 'notificationclick') notificationClickHandler = handler
    },
    skipWaiting: vi.fn(),
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn().mockResolvedValue(null),
    },
    registration: {
      showNotification: vi.fn().mockResolvedValue(undefined),
    },
    _listeners: listeners,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

async function loadSW() {
  // @ts-expect-error — plain JS asset, no declaration
  await import('../../public/sw.js')
}

describe('SW push handler', () => {
  it('muestra notificación con título, body y data.url del payload JSON', async () => {
    await loadSW()
    expect(pushHandler).not.toBeNull()

    const { waitUntil, flush } = makeWaitUntil()
    const payload = { title: 'Recordatorio', body: 'Hora de la medicina', url: '/pautas' }
    const event = {
      waitUntil,
      data: { json: () => payload },
    }

    pushHandler!(event)
    await flush()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const showNotification = (self as any).registration.showNotification
    expect(showNotification).toHaveBeenCalledOnce()
    expect(showNotification).toHaveBeenCalledWith('Recordatorio', {
      body: 'Hora de la medicina',
      data: { url: '/pautas' },
    })
  })
})

describe('SW notificationclick handler', () => {
  it('enfoca una pestaña abierta en data.url si existe', async () => {
    const focusFn = vi.fn().mockResolvedValue(undefined)
    const matchingClient = { url: 'https://app.tandem.com/pautas', focus: focusFn }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(self as any).clients.matchAll.mockResolvedValue([matchingClient])

    await loadSW()
    expect(notificationClickHandler).not.toBeNull()

    const { waitUntil, flush } = makeWaitUntil()
    const closeFn = vi.fn()
    const event = {
      waitUntil,
      notification: { data: { url: '/pautas' }, close: closeFn },
    }

    notificationClickHandler!(event)
    await flush()

    expect(closeFn).toHaveBeenCalledOnce()
    expect(focusFn).toHaveBeenCalledOnce()
  })

  it('abre una nueva pestaña si no hay ninguna abierta con data.url', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(self as any).clients.matchAll.mockResolvedValue([])

    await loadSW()
    expect(notificationClickHandler).not.toBeNull()

    const { waitUntil, flush } = makeWaitUntil()
    const closeFn = vi.fn()
    const event = {
      waitUntil,
      notification: { data: { url: '/pautas' }, close: closeFn },
    }

    notificationClickHandler!(event)
    await flush()

    expect(closeFn).toHaveBeenCalledOnce()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((self as any).clients.openWindow).toHaveBeenCalledWith('/pautas')
  })
})
