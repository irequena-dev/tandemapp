import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import {
  useCreateEventType,
  useDeleteEventType,
  useEventTypes,
  useUpdateEventType,
} from './event-types-api'
import type { EventTypeOut } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/event-types'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const systemTypes: EventTypeOut[] = [
  { id: 'et-1', family_id: null, name: 'Médico', icon: 'stethoscope', is_system: true },
  { id: 'et-2', family_id: null, name: 'Cole', icon: 'school', is_system: true },
  { id: 'et-3', family_id: null, name: 'Extraescolar', icon: 'activity', is_system: true },
  { id: 'et-4', family_id: null, name: 'Trámite', icon: 'file', is_system: true },
  { id: 'et-5', family_id: null, name: 'Otros', icon: 'circle', is_system: true },
]

describe('useEventTypes', () => {
  it('lista tipos base y personalizados del backend', async () => {
    const custom: EventTypeOut = {
      id: 'et-custom',
      family_id: 'fam-1',
      name: 'Deporte',
      icon: 'circle',
      is_system: false,
    }
    server.use(http.get(URL, () => HttpResponse.json([...systemTypes, custom])))

    const { result } = renderHook(() => useEventTypes(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(6)
    expect(result.current.data?.filter((t) => t.is_system)).toHaveLength(5)
  })
})

describe('useCreateEventType', () => {
  it('crea un tipo personalizado y reconcilia la lista', async () => {
    const store: EventTypeOut[] = [...systemTypes]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(URL, async ({ request }) => {
        const body = (await request.json()) as { name: string; icon?: string }
        const created: EventTypeOut = {
          id: 'et-new',
          family_id: 'fam-1',
          name: body.name,
          icon: body.icon ?? 'circle',
          is_system: false,
        }
        store.push(created)
        return HttpResponse.json(created, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useEventTypes(), create: useCreateEventType() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({ name: 'Cumpleaños', icon: 'cake' })
    })

    // Optimista: aparece inmediatamente.
    await waitFor(() =>
      expect(
        result.current.list.data?.some((t) => t.name === 'Cumpleaños'),
      ).toBe(true),
    )
    // Reconciliado con el servidor.
    await waitFor(() =>
      expect(result.current.list.data?.find((t) => t.name === 'Cumpleaños')?.id).toBe(
        'et-new',
      ),
    )
  })
})

describe('useUpdateEventType', () => {
  it('edita un tipo personalizado con actualización optimista', async () => {
    const custom: EventTypeOut = {
      id: 'et-upd',
      family_id: 'fam-1',
      name: 'Deporte',
      icon: 'circle',
      is_system: false,
    }
    const store: EventTypeOut[] = [...systemTypes, { ...custom }]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.patch(`${URL}/:id`, async ({ request }) => {
        const body = (await request.json()) as { name?: string; icon?: string }
        const idx = store.findIndex((t) => t.id === 'et-upd')
        if (idx !== -1) {
          if (body.name) store[idx].name = body.name
          if (body.icon) store[idx].icon = body.icon
        }
        return HttpResponse.json(store[idx])
      }),
    )

    const { result } = renderHook(
      () => ({ list: useEventTypes(), update: useUpdateEventType() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.update.mutate({
        id: 'et-upd',
        patch: { name: 'Fútbol', icon: 'ball' },
      })
    })

    // Optimista: el nombre cambia inmediatamente.
    await waitFor(() =>
      expect(result.current.list.data?.find((t) => t.id === 'et-upd')?.name).toBe(
        'Fútbol',
      ),
    )
  })
})

describe('useDeleteEventType', () => {
  it('borra un tipo personalizado con eliminación optimista', async () => {
    const custom: EventTypeOut = {
      id: 'et-del',
      family_id: 'fam-1',
      name: 'Temporal',
      icon: 'circle',
      is_system: false,
    }
    const store: EventTypeOut[] = [...systemTypes, custom]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:id`, ({ params }) => {
        const idx = store.findIndex((t) => t.id === params['id'])
        if (idx !== -1) store.splice(idx, 1)
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useEventTypes(), del: useDeleteEventType() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(6))

    act(() => {
      result.current.del.mutate('et-del')
    })

    // Optimista: desaparece inmediatamente.
    await waitFor(() => expect(result.current.list.data).toHaveLength(5))
    expect(result.current.list.data?.every((t) => t.is_system)).toBe(true)
  })

  it('restaura la lista si el borrado falla', async () => {
    const custom: EventTypeOut = {
      id: 'et-fail',
      family_id: 'fam-1',
      name: 'Fallido',
      icon: 'circle',
      is_system: false,
    }
    server.use(
      http.get(URL, () => HttpResponse.json([...systemTypes, custom])),
      http.delete(`${URL}/:id`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useEventTypes(), del: useDeleteEventType() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(6))

    act(() => {
      result.current.del.mutate('et-fail')
    })

    await waitFor(() => expect(result.current.del.isError).toBe(true))
    // Rollback: el tipo sigue en la lista.
    expect(result.current.list.data?.map((t) => t.id)).toContain('et-fail')
  })
})
