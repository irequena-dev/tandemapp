import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useChildren, useChildrenWithMetrics, useCreateChild, useDeleteChild } from './api'
import type { Child, ChildInput, ChildWithMetrics } from './types'

// Solo se mockea la frontera de auth: `getToken` devuelve un token de prueba.
// El resto (TanStack Query, fetch) es real; la red la mockea MSW.
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/children'

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

const mara: Child = {
  id: 'srv-mara',
  family_id: 'fam',
  name: 'Mara',
  birth_date: '2020-05-01',
  avatar_color: null,
}

describe('useChildren', () => {
  it('lista los Hijos devueltos por el backend', async () => {
    server.use(http.get(URL, () => HttpResponse.json([mara])))

    const { result } = renderHook(() => useChildren(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([mara])
  })
})

describe('useCreateChild (optimistic)', () => {
  it('inserta de inmediato y luego reconcilia con el dato del servidor', async () => {
    const store: Child[] = []
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(URL, async ({ request }) => {
        const input = (await request.json()) as ChildInput
        const child: Child = {
          id: 'srv-1',
          family_id: 'fam',
          name: input.name,
          birth_date: input.birth_date,
          avatar_color: input.avatar_color ?? null,
        }
        store.push(child)
        return HttpResponse.json(child, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useChildren(), create: useCreateChild() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({ name: 'Mara', birth_date: '2020-05-01' })
    })

    // Optimista: aparece antes de que responda el servidor (id provisional).
    await waitFor(() =>
      expect(result.current.list.data?.map((c) => c.name)).toContain('Mara'),
    )

    // Reconciliación: tras el refetch, gana el id real del servidor.
    await waitFor(() =>
      expect(result.current.list.data?.map((c) => c.id)).toEqual(['srv-1']),
    )
  })

  it('revierte la inserción optimista si el alta falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([mara])),
      http.post(URL, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useChildren(), create: useCreateChild() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({ name: 'Fantasma', birth_date: '2021-01-01' })
    })

    await waitFor(() => expect(result.current.create.isError).toBe(true))
    // La lista vuelve a su estado previo: nada de "Fantasma".
    expect(result.current.list.data?.map((c) => c.name)).toEqual(['Mara'])
  })
})

describe('useDeleteChild (optimistic)', () => {
  it('elimina de la lista al borrar', async () => {
    const store: Child[] = [mara]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:id`, () => {
        store.length = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useChildren(), remove: useDeleteChild() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.remove.mutate('srv-mara')
    })

    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })
})

// ---------- useChildrenWithMetrics ----------

const maraWithMetrics: ChildWithMetrics = {
  id: 'srv-mara',
  family_id: 'fam',
  name: 'Mara',
  birth_date: '2020-05-01',
  avatar_color: null,
  current_height_cm: 95,
  current_weight_kg: 14.5,
  current_talla: '5-6 años',
  current_talla_calzado: '28',
}

const lucasNoMetrics: ChildWithMetrics = {
  id: 'srv-lucas',
  family_id: 'fam',
  name: 'Lucas',
  birth_date: '2019-04-10',
  avatar_color: 'sage',
  current_height_cm: null,
  current_weight_kg: null,
  current_talla: null,
  current_talla_calzado: null,
}

describe('useChildrenWithMetrics', () => {
  it('lista los Hijos con métricas actuales', async () => {
    server.use(
      http.get(URL, ({ request }) => {
        if (request.url.includes('include=current_metrics')) {
          return HttpResponse.json([maraWithMetrics])
        }
        return HttpResponse.json([mara])
      }),
    )

    const { result } = renderHook(() => useChildrenWithMetrics(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([maraWithMetrics])
    expect(result.current.data![0].current_height_cm).toBe(95)
    expect(result.current.data![0].current_talla).toBe('5-6 años')
  })

  it('devuelve null cuando el Hijo no tiene métricas', async () => {
    server.use(
      http.get(URL, ({ request }) => {
        if (request.url.includes('include=current_metrics')) {
          return HttpResponse.json([lucasNoMetrics])
        }
        return HttpResponse.json([])
      }),
    )

    const { result } = renderHook(() => useChildrenWithMetrics(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data![0].current_height_cm).toBeNull()
    expect(result.current.data![0].current_weight_kg).toBeNull()
    expect(result.current.data![0].current_talla).toBeNull()
    expect(result.current.data![0].current_talla_calzado).toBeNull()
  })
})
