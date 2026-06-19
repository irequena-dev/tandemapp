import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import {
  useCreateMeasurement,
  useCurrentMeasurements,
  useDeleteMeasurement,
  useMeasurements,
} from './api'
import type { CurrentMeasurements, Measurement, MeasurementInput } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const BASE = 'http://localhost:8000/children/child-1/measurements'

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

const height1: Measurement = {
  id: 'srv-h1',
  child_id: 'child-1',
  type: 'height',
  value: 95,
  unit: 'cm',
  measured_at: '2025-06-01',
  recorded_by: 'user-1',
  created_at: '2025-06-01T10:00:00Z',
}

const height2: Measurement = {
  id: 'srv-h2',
  child_id: 'child-1',
  type: 'height',
  value: 100,
  unit: 'cm',
  measured_at: '2026-01-01',
  recorded_by: 'user-1',
  created_at: '2026-01-01T10:00:00Z',
}

const weight1: Measurement = {
  id: 'srv-w1',
  child_id: 'child-1',
  type: 'weight',
  value: 14.5,
  unit: 'kg',
  measured_at: '2026-01-01',
  recorded_by: 'user-1',
  created_at: '2026-01-01T10:00:00Z',
}

describe('useMeasurements', () => {
  it('lista las Medidas devueltas por el backend', async () => {
    server.use(http.get(BASE, () => HttpResponse.json([height2, height1, weight1])))

    const { result } = renderHook(() => useMeasurements('child-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(3)
  })

  it('filtra por tipo cuando se pasa el parámetro', async () => {
    server.use(
      http.get(BASE, ({ request }) => {
        const url = new URL(request.url)
        const type = url.searchParams.get('type')
        const data = [height2, height1, weight1].filter(
          (m) => !type || m.type === type,
        )
        return HttpResponse.json(data)
      }),
    )

    const { result } = renderHook(() => useMeasurements('child-1', 'height'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(result.current.data?.every((m) => m.type === 'height')).toBe(true)
  })
})

describe('useCurrentMeasurements', () => {
  it('devuelve los valores más recientes por tipo', async () => {
    const current: CurrentMeasurements = { height: height2, weight: weight1 }
    server.use(
      http.get(`${BASE}/current`, () => HttpResponse.json(current)),
    )

    const { result } = renderHook(() => useCurrentMeasurements('child-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.height?.value).toBe(100)
    expect(result.current.data?.weight?.value).toBe(14.5)
  })
})

describe('useCreateMeasurement (optimistic)', () => {
  it('inserta de inmediato y luego reconcilia', async () => {
    const store: Measurement[] = []
    server.use(
      http.get(BASE, () => HttpResponse.json(store)),
      http.post(BASE, async ({ request }) => {
        const input = (await request.json()) as MeasurementInput
        const m: Measurement = {
          id: 'srv-new',
          child_id: 'child-1',
          recorded_by: 'user-1',
          created_at: new Date().toISOString(),
          ...input,
        }
        store.push(m)
        return HttpResponse.json(m, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useMeasurements('child-1'),
        create: useCreateMeasurement('child-1'),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({
        type: 'height',
        value: 105,
        unit: 'cm',
        measured_at: '2026-06-01',
      })
    })

    // Optimista: aparece antes de que responda el servidor.
    await waitFor(() =>
      expect(result.current.list.data?.some((m) => m.value === 105)).toBe(true),
    )

    // Reconciliación: id real del servidor.
    await waitFor(() =>
      expect(result.current.list.data?.map((m) => m.id)).toContain('srv-new'),
    )
  })
})

describe('useDeleteMeasurement (optimistic)', () => {
  it('elimina de la lista al borrar', async () => {
    const store: Measurement[] = [height1]
    server.use(
      http.get(BASE, () => HttpResponse.json(store)),
      http.delete(`${BASE}/:id`, () => {
        store.length = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({
        list: useMeasurements('child-1'),
        remove: useDeleteMeasurement('child-1'),
      }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.remove.mutate('srv-h1')
    })

    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })
})
