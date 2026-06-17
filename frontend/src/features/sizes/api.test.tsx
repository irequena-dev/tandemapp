import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useCreateSize, useCurrentSizes, useDeleteSize, useSizes } from './api'
import type { CurrentSizesOut, SizeOut } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const BASE = 'http://localhost:8000/children/child-1/sizes'

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

const clothingSize: SizeOut = {
  id: 'sz-1',
  child_id: 'child-1',
  type: 'clothing',
  label: '5-6 años',
  recorded_at: '2026-06-01',
  recorded_by: 'user-1',
  created_at: '2026-06-01T10:00:00Z',
}

const footwearSize: SizeOut = {
  id: 'sz-2',
  child_id: 'child-1',
  type: 'footwear',
  label: '29',
  recorded_at: '2026-06-01',
  recorded_by: 'user-1',
  created_at: '2026-06-01T10:00:00Z',
}

describe('useSizes', () => {
  it('lista las Tallas de un Hijo', async () => {
    server.use(http.get(BASE, () => HttpResponse.json([clothingSize, footwearSize])))

    const { result } = renderHook(() => useSizes('child-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([clothingSize, footwearSize])
  })

  it('filtra por tipo clothing', async () => {
    server.use(
      http.get(BASE, ({ request }) => {
        const url = new URL(request.url)
        const type = url.searchParams.get('type')
        if (type === 'clothing') return HttpResponse.json([clothingSize])
        return HttpResponse.json([clothingSize, footwearSize])
      }),
    )

    const { result } = renderHook(() => useSizes('child-1', 'clothing'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([clothingSize])
  })
})

describe('useCurrentSizes', () => {
  it('devuelve las Tallas actuales por tipo', async () => {
    const current: CurrentSizesOut = {
      clothing: clothingSize,
      footwear: footwearSize,
    }
    server.use(http.get(`${BASE}/current`, () => HttpResponse.json(current)))

    const { result } = renderHook(() => useCurrentSizes('child-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.clothing?.label).toBe('5-6 años')
    expect(result.current.data?.footwear?.label).toBe('29')
  })

  it('devuelve null cuando no hay Tallas', async () => {
    const current: CurrentSizesOut = { clothing: null, footwear: null }
    server.use(http.get(`${BASE}/current`, () => HttpResponse.json(current)))

    const { result } = renderHook(() => useCurrentSizes('child-1'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.clothing).toBeNull()
    expect(result.current.data?.footwear).toBeNull()
  })
})

describe('useCreateSize (optimistic)', () => {
  it('inserta de inmediato y reconcilia con el dato del servidor', async () => {
    const store: SizeOut[] = []
    server.use(
      http.get(BASE, () => HttpResponse.json(store)),
      http.post(BASE, async ({ request }) => {
        const input = (await request.json()) as Record<string, unknown>
        const created: SizeOut = {
          id: 'srv-sz-new',
          child_id: 'child-1',
          type: input.type as 'clothing',
          label: input.label as string,
          recorded_at: input.recorded_at as string,
          recorded_by: 'user-1',
          created_at: '2026-06-17T10:00:00Z',
        }
        store.push(created)
        return HttpResponse.json(created, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useSizes('child-1'), create: useCreateSize('child-1') }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({
        type: 'clothing',
        label: '7 años',
        recorded_at: '2026-06-17',
      })
    })

    // Optimista: aparece antes de respuesta
    await waitFor(() =>
      expect(result.current.list.data?.map((s) => s.label)).toContain('7 años'),
    )

    // Reconciliación: tras refetch gana id real
    await waitFor(() =>
      expect(result.current.list.data?.map((s) => s.id)).toContain('srv-sz-new'),
    )
  })
})

describe('useDeleteSize (optimistic)', () => {
  it('elimina de la lista al borrar', async () => {
    const store: SizeOut[] = [clothingSize]
    server.use(
      http.get(BASE, () => HttpResponse.json(store)),
      http.delete(`${BASE}/:id`, () => {
        store.length = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useSizes('child-1'), remove: useDeleteSize('child-1') }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.remove.mutate('sz-1')
    })

    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })
})
