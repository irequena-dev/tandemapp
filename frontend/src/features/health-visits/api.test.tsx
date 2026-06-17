import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import {
  useCreateHealthVisit,
  useDeleteHealthVisit,
  useHealthVisits,
  useUpdateHealthVisit,
} from './api'
import type { HealthVisit, HealthVisitInput } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const CHILD_ID = 'child-001'
const URL = `http://localhost:8000/children/${CHILD_ID}/health-visits`

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

const visit: HealthVisit = {
  id: 'vis-1',
  child_id: CHILD_ID,
  family_id: 'fam',
  visited_at: '2026-06-12',
  diagnosis: 'Otitis media',
  notes: 'Prescribe amoxicilina',
  pauta_ids: [],
  created_by: 'user-1',
  created_at: '2026-06-12T10:00:00Z',
}

describe('useHealthVisits', () => {
  it('lista las Visitas devueltas por el backend', async () => {
    server.use(http.get(URL, () => HttpResponse.json([visit])))

    const { result } = renderHook(() => useHealthVisits(CHILD_ID), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([visit])
  })
})

describe('useCreateHealthVisit (optimistic)', () => {
  it('inserta de inmediato y reconcilia con el dato del servidor', async () => {
    const store: HealthVisit[] = []
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(URL, async ({ request }) => {
        const input = (await request.json()) as HealthVisitInput
        const created: HealthVisit = {
          id: 'srv-vis-1',
          child_id: CHILD_ID,
          family_id: 'fam',
          visited_at: input.visited_at,
          diagnosis: input.diagnosis,
          notes: input.notes ?? null,
          pauta_ids: [],
          created_by: 'user-1',
          created_at: new Date().toISOString(),
        }
        store.push(created)
        return HttpResponse.json(created, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useHealthVisits(CHILD_ID),
        create: useCreateHealthVisit(CHILD_ID),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({
        visited_at: '2026-06-12',
        diagnosis: 'Otitis',
        notes: 'Amoxicilina 7 días',
      })
    })

    // Optimista: aparece antes de la respuesta
    await waitFor(() =>
      expect(result.current.list.data?.map((v) => v.diagnosis)).toContain('Otitis'),
    )

    // Reconciliación: id real del servidor
    await waitFor(() =>
      expect(result.current.list.data?.map((v) => v.id)).toEqual(['srv-vis-1']),
    )
  })

  it('revierte la inserción si el alta falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([visit])),
      http.post(URL, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({
        list: useHealthVisits(CHILD_ID),
        create: useCreateHealthVisit(CHILD_ID),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({
        visited_at: '2026-01-01',
        diagnosis: 'Fantasma',
      })
    })

    await waitFor(() => expect(result.current.create.isError).toBe(true))
    expect(result.current.list.data?.map((v) => v.diagnosis)).toEqual([
      'Otitis media',
    ])
  })
})

describe('useUpdateHealthVisit (optimistic)', () => {
  it('actualiza optimistamente el diagnóstico y reconcilia con el servidor', async () => {
    const store = [{ ...visit }]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.patch(`${URL}/:id`, async ({ request }) => {
        const patch = (await request.json()) as Record<string, unknown>
        Object.assign(store[0], patch)
        return HttpResponse.json(store[0])
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useHealthVisits(CHILD_ID),
        update: useUpdateHealthVisit(CHILD_ID),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.update.mutate({
        id: visit.id,
        patch: { diagnosis: 'Otitis leve' },
      })
    })

    await waitFor(() =>
      expect(result.current.list.data?.[0]?.diagnosis).toBe('Otitis leve'),
    )
  })
})

describe('useDeleteHealthVisit (optimistic)', () => {
  it('elimina de la lista al borrar', async () => {
    const store = [visit]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:id`, () => {
        store.length = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useHealthVisits(CHILD_ID),
        remove: useDeleteHealthVisit(CHILD_ID),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.remove.mutate(visit.id)
    })

    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })
})
