import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useCreateAdministration, useDeleteAdministration, useFinishPauta, usePautas } from './api'
import type { Administration, Pauta } from './types'

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
  member_id: null,
  subject_name: 'Mateo',
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
  todays_administrations: [],
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
    const mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      dismiss: vi.fn(),
    }
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
      () => ({ list: usePautas(), finish: useFinishPauta(mockToast) }),
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
    const mockToast = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      dismiss: vi.fn(),
    }
    server.use(
      http.get(URL, () => HttpResponse.json([activePauta])),
      http.post(`${URL}/:id/finish`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: usePautas(), finish: useFinishPauta(mockToast) }),
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

describe('useCreateAdministration (optimistic)', () => {
  it('marca toma con optimistic update y reconcilia', async () => {
    const adminOut: Administration = {
      id: 'admin-1',
      pauta_id: 'pauta-1',
      administered_at: new Date().toISOString(),
      administered_by: 'member-1',
      member_name: 'Ana',
      created_at: new Date().toISOString(),
    }
    const store: Pauta[] = [{ ...activePauta }]

    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(`${URL}/:pautaId/administrations`, () => {
        // Mutate the store so refetch reflects the admin
        store[0] = {
          ...store[0],
          todays_administrations: [...store[0].todays_administrations, adminOut],
        }
        return HttpResponse.json(adminOut, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: usePautas(), create: useCreateAdministration() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate('pauta-1')
    })

    // Optimista: todays_administrations crece inmediatamente
    await waitFor(() => {
      const pauta = result.current.list.data?.find((p) => p.id === 'pauta-1')
      expect((pauta?.todays_administrations?.length ?? 0) > 0).toBe(true)
    })
  })

  it('señala error si marcar toma falla en el servidor', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([activePauta])),
      http.post(`${URL}/:pautaId/administrations`, () =>
        new HttpResponse(null, { status: 500 }),
      ),
    )

    const { result } = renderHook(
      () => ({ list: usePautas(), create: useCreateAdministration() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate('pauta-1')
    })

    await waitFor(() => expect(result.current.create.isError).toBe(true))
  })
})

describe('useDeleteAdministration (deshacer)', () => {
  it('deshace toma con optimistic update', async () => {
    const admin: Administration = {
      id: 'admin-del-1',
      pauta_id: 'pauta-1',
      administered_at: new Date().toISOString(),
      administered_by: 'member-1',
      member_name: 'Ana',
      created_at: new Date().toISOString(),
    }
    const store: Pauta[] = [{
      ...activePauta,
      todays_administrations: [admin],
    }]

    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:pautaId/administrations/:adminId`, ({ params }) => {
        // Mutate the store so refetch reflects the deletion
        store[0] = {
          ...store[0],
          todays_administrations: store[0].todays_administrations.filter(
            (a) => a.id !== params['adminId'],
          ),
        }
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: usePautas(), del: useDeleteAdministration() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(result.current.list.data?.[0].todays_administrations).toHaveLength(1)

    act(() => {
      result.current.del.mutate({ pautaId: 'pauta-1', adminId: 'admin-del-1' })
    })

    // Optimista: la administración desaparece inmediatamente
    await waitFor(() => {
      const pauta = result.current.list.data?.find((p) => p.id === 'pauta-1')
      expect(pauta?.todays_administrations).toHaveLength(0)
    })
  })
})
