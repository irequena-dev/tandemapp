import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import {
  useCreateEvent,
  useDeleteEvent,
  useDoneEvent,
  useEvents,
  useUndoEvent,
} from './events-api'
import type { EventCreate, EventOut } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/events'

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

const baseType = {
  id: 'type-medico',
  family_id: null,
  name: 'Médico',
  icon: 'stethoscope',
  is_system: true,
}

function makeEvent(overrides: Partial<EventOut> = {}): EventOut {
  return {
    id: 'ev-1',
    family_id: 'fam',
    title: 'Pediatra',
    date: '2030-06-28',
    time: '10:00:00',
    event_type_id: 'type-medico',
    event_type: baseType,
    child_id: null,
    child: null,
    status: 'pending',
    is_overdue: false,
    series_id: null,
    created_by: 'member-1',
    created_at: '2026-06-17T10:00:00Z',
    ...overrides,
  }
}

describe('useEvents', () => {
  it('lista los Eventos devueltos por el backend', async () => {
    const ev = makeEvent()
    server.use(http.get(URL, () => HttpResponse.json([ev])))

    const { result } = renderHook(() => useEvents(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([ev])
  })
})

describe('useCreateEvent (optimistic)', () => {
  it('inserta de inmediato y reconcilia con el servidor', async () => {
    const store: EventOut[] = []
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(URL, async ({ request }) => {
        const input = (await request.json()) as EventCreate
        const created = makeEvent({
          id: 'srv-ev-1',
          title: input.title,
          date: input.date,
          time: input.time ?? null,
        })
        store.push(created)
        return HttpResponse.json(created, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useEvents(), create: useCreateEvent() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({
        title: 'Vacuna',
        date: '2030-07-01',
        event_type_id: 'type-medico',
      })
    })

    // Optimista: aparece antes de la respuesta del servidor.
    await waitFor(() =>
      expect(result.current.list.data?.map((e) => e.title)).toContain(
        'Vacuna',
      ),
    )

    // Reconciliación: id real del servidor.
    await waitFor(() =>
      expect(result.current.list.data?.map((e) => e.id)).toEqual([
        'srv-ev-1',
      ]),
    )
  })

  it('revierte la inserción optimista si falla', async () => {
    const existing = makeEvent()
    server.use(
      http.get(URL, () => HttpResponse.json([existing])),
      http.post(URL, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useEvents(), create: useCreateEvent() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({
        title: 'Fantasma',
        date: '2030-07-01',
        event_type_id: 'type-medico',
      })
    })

    await waitFor(() => expect(result.current.create.isError).toBe(true))
    expect(result.current.list.data?.map((e) => e.title)).toEqual([
      'Pediatra',
    ])
  })
})

describe('useDoneEvent / useUndoEvent (optimistic)', () => {
  it('marca done y luego undo optimísticamente', async () => {
    const ev = makeEvent({ id: 'ev-done', status: 'pending' })
    server.use(
      http.get(URL, () => HttpResponse.json([ev])),
      http.post(`${URL}/:id/done`, ({ params }) => {
        ev.status = 'done'
        ev.is_overdue = false
        return HttpResponse.json({ ...ev, id: params['id'] })
      }),
      http.post(`${URL}/:id/undo`, ({ params }) => {
        ev.status = 'pending'
        return HttpResponse.json({ ...ev, id: params['id'] })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useEvents(), done: useDoneEvent(), undo: useUndoEvent() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    // Mark done
    act(() => {
      result.current.done.mutate('ev-done')
    })

    await waitFor(() =>
      expect(
        result.current.list.data?.find((e) => e.id === 'ev-done')?.status,
      ).toBe('done'),
    )

    // Undo
    act(() => {
      result.current.undo.mutate('ev-done')
    })

    await waitFor(() =>
      expect(
        result.current.list.data?.find((e) => e.id === 'ev-done')?.status,
      ).toBe('pending'),
    )
  })
})

describe('useDeleteEvent (optimistic)', () => {
  it('elimina de la lista al borrar', async () => {
    const ev = makeEvent({ id: 'ev-del' })
    const store: EventOut[] = [ev]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:id`, () => {
        store.length = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useEvents(), remove: useDeleteEvent() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.remove.mutate('ev-del')
    })

    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })
})
