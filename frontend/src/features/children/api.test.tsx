import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useChildren, useCreateChild, useDeleteChild } from './api'
import type { Child, ChildInput } from './types'

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
        const child: Child = { id: 'srv-1', family_id: 'fam', ...input }
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
