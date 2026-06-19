import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useEvents } from './events-api'
import { computeOccurrences, useCreateSeries, useDeleteSeriesFuture } from './series-api'
import type { SeriesCreate } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const SERIES_URL = 'http://localhost:8000/api/series'
const FUTURE_URL = 'http://localhost:8000/api/series/:id/future'
const EVENTS_URL = 'http://localhost:8000/events'

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

/* ---------- computeOccurrences (preview) ---------- */

describe('computeOccurrences (preview)', () => {
  it('weekly con max_count genera N fechas cada 7 días desde el día ancla', () => {
    const out = computeOccurrences({
      cadence: 'weekly',
      day_of_week: 0, // lunes
      starts_at: '2030-01-07', // lunes
      max_count: 3,
    })
    expect(out).toEqual(['2030-01-07', '2030-01-14', '2030-01-21'])
  })

  it('avanza la 1ª ocurrencia al día ancla si starts_at no cae en él', () => {
    const out = computeOccurrences({
      cadence: 'weekly',
      day_of_week: 4, // viernes
      starts_at: '2030-01-07', // lunes → 1ª = viernes 11
      max_count: 2,
    })
    expect(out).toEqual(['2030-01-11', '2030-01-18'])
  })

  it('biweekly salta cada 14 días', () => {
    const out = computeOccurrences({
      cadence: 'biweekly',
      day_of_week: 2,
      starts_at: '2030-01-09',
      max_count: 3,
    })
    expect(out).toEqual(['2030-01-09', '2030-01-23', '2030-02-06'])
  })

  it('monthly usa el día de mes de starts_at con clamp a fin de mes', () => {
    const out = computeOccurrences({
      cadence: 'monthly',
      starts_at: '2030-01-31',
      ends_at: '2030-04-30',
    })
    expect(out).toEqual([
      '2030-01-31',
      '2030-02-28',
      '2030-03-31',
      '2030-04-30',
    ])
  })

  it('ends_at acota las ocurrencias (fecha incluida)', () => {
    const out = computeOccurrences({
      cadence: 'weekly',
      day_of_week: 0,
      starts_at: '2030-01-07',
      ends_at: '2030-01-21',
    })
    expect(out).toEqual(['2030-01-07', '2030-01-14', '2030-01-21'])
  })
})

/* ---------- useCreateSeries ---------- */

describe('useCreateSeries', () => {
  it('POST /api/series y devuelve { id, events_created }', async () => {
    const posted: { value?: SeriesCreate } = {}
    server.use(
      http.post(SERIES_URL, async ({ request }) => {
        posted.value = (await request.json()) as SeriesCreate
        return HttpResponse.json({ id: 'ser-1', events_created: 3 }, { status: 201 })
      }),
    )

    const { result } = renderHook(() => useCreateSeries(), { wrapper: makeWrapper() })

    act(() => {
      result.current.mutate({
        title: 'Extraescolar',
        event_type_id: 'type-1',
        cadence: 'weekly',
        day_of_week: 0,
        starts_at: '2030-01-07',
        max_count: 3,
      })
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual({ id: 'ser-1', events_created: 3 })
    expect(posted.value?.title).toBe('Extraescolar')
  })

  it('invalida la caché de Eventos al crear', async () => {
    let gets = 0
    server.use(
      http.get(EVENTS_URL, () => {
        gets += 1
        return HttpResponse.json([])
      }),
      http.post(SERIES_URL, () =>
        HttpResponse.json({ id: 'ser-1', events_created: 1 }, { status: 201 }),
      ),
    )

    const { result } = renderHook(
      () => ({ events: useEvents(), create: useCreateSeries() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.events.isSuccess).toBe(true))
    const getsAfterMount = gets

    act(() => {
      result.current.create.mutate({
        title: 'X',
        event_type_id: 't',
        cadence: 'monthly',
        starts_at: '2030-01-15',
        max_count: 1,
      })
    })
    await waitFor(() => expect(result.current.create.isSuccess).toBe(true))
    // La invalidación dispara un nuevo GET de Eventos.
    await waitFor(() => expect(gets).toBeGreaterThan(getsAfterMount))
  })
})

/* ---------- useDeleteSeriesFuture ---------- */

describe('useDeleteSeriesFuture', () => {
  it('DELETE /api/series/:id/future → 204', async () => {
    let deletedId: string | null = null
    server.use(
      http.delete(FUTURE_URL, ({ params }) => {
        deletedId = params['id'] as string
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(() => useDeleteSeriesFuture(), {
      wrapper: makeWrapper(),
    })

    act(() => {
      result.current.mutate('ser-42')
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(deletedId).toBe('ser-42')
  })
})
