import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useFinishPauta, usePautas } from './api'
import type { Pauta } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/pautas'

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

const activePauta: Pauta = {
  id: 'pauta-1',
  family_id: 'fam',
  child_id: 'hijo-1',
  medication: 'Amoxicilina',
  dose: '5 ml',
  interval_hours: 8,
  duration_days: 7,
  started_at: '2026-06-12T08:00:00Z',
  ends_at: '2026-06-19T08:00:00Z',
  status: 'active',
  health_visit_id: null,
  created_by: 'member-1',
  created_at: '2026-06-12T08:00:00Z',
  day_number: 3,
  next_dose_at: '2026-06-12T16:00:00Z',
}

const finishedPauta: Pauta = {
  ...activePauta,
  id: 'pauta-2',
  medication: 'Ibuprofeno',
  status: 'finished',
  next_dose_at: null,
}

describe('usePautas', () => {
  it('lista las Pautas devueltas por el backend', async () => {
    server.use(http.get(URL, () => HttpResponse.json([activePauta, finishedPauta])))

    const { result } = renderHook(() => usePautas(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.[0].medication).toBe('Amoxicilina')
  })

  it('filtra por status con query param', async () => {
    // MSW matches the exact URL including query string
    server.use(
      http.get(URL, () => HttpResponse.json([activePauta])),
    )

    const { result } = renderHook(() => usePautas({ status: 'active' }), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].status).toBe('active')
  })
})

describe('useFinishPauta (optimistic)', () => {
  it('marca la Pauta como finished de inmediato y reconcilia', async () => {
    const store: Pauta[] = [activePauta]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(`${URL}/:id/finish`, ({ params }) => {
        const pauta = store.find((p) => p.id === params['id'])
        if (!pauta) return new HttpResponse(null, { status: 404 })
        pauta.status = 'finished'
        return HttpResponse.json(pauta)
      }),
    )

    const { result } = renderHook(
      () => ({ list: usePautas(), finish: useFinishPauta() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.finish.mutate('pauta-1')
    })

    // Optimista: se marca finished inmediatamente
    await waitFor(() =>
      expect(result.current.list.data?.find((p) => p.id === 'pauta-1')?.status).toBe(
        'finished',
      ),
    )
  })

  it('señala error si la finalización falla en el servidor', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([activePauta])),
      http.post(`${URL}/:id/finish`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: usePautas(), finish: useFinishPauta() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.finish.mutate('pauta-1')
    })

    // La mutación reporta error
    await waitFor(() => expect(result.current.finish.isError).toBe(true))
  })
})
