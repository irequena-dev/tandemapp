import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useShoppingItems, useCreateShoppingItem, useBuyShoppingItem, useUndoShoppingItem } from './api'
import type { ShoppingItem } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/api/shopping-items'

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

const leche: ShoppingItem = {
  id: 'srv-leche',
  family_id: 'fam',
  text: 'Leche entera',
  status: 'pending',
  created_by: 'user-1',
  bought_by: null,
  bought_at: null,
  created_at: '2026-06-17T10:00:00Z',
  updated_at: '2026-06-17T10:00:00Z',
}

describe('useShoppingItems', () => {
  it('lista los Ítems devueltos por el backend', async () => {
    server.use(http.get(URL, () => HttpResponse.json([leche])))

    const { result } = renderHook(() => useShoppingItems(), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([leche])
  })
})

describe('useCreateShoppingItem (optimistic)', () => {
  it('inserta de inmediato y luego reconcilia con el dato del servidor', async () => {
    const store: ShoppingItem[] = []
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(URL, async ({ request }) => {
        const input = (await request.json()) as { text: string }
        const item: ShoppingItem = {
          id: 'srv-1',
          family_id: 'fam',
          text: input.text,
          status: 'pending',
          created_by: 'user-1',
          bought_by: null,
          bought_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        store.push(item)
        return HttpResponse.json(item, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), create: useCreateShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({ text: 'Pan de molde' })
    })

    // Optimista: aparece antes de que responda el servidor.
    await waitFor(() =>
      expect(result.current.list.data?.map((i) => i.text)).toContain(
        'Pan de molde',
      ),
    )

    // Reconciliación: tras el refetch, gana el id real del servidor.
    await waitFor(() =>
      expect(result.current.list.data?.map((i) => i.id)).toEqual(['srv-1']),
    )
  })

  it('revierte la inserción optimista si el alta falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([leche])),
      http.post(URL, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), create: useCreateShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({ text: 'Fantasma' })
    })

    await waitFor(() => expect(result.current.create.isError).toBe(true))
    expect(result.current.list.data?.map((i) => i.text)).toEqual([
      'Leche entera',
    ])
  })
})

describe('useBuyShoppingItem (optimistic)', () => {
  it('marca bought de inmediato y reconcilia con el servidor', async () => {
    const store: ShoppingItem[] = [{ ...leche }]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(`${URL}/:id/buy`, ({ params }) => {
        const item = store.find((i) => i.id === params.id)!
        item.status = 'bought'
        item.bought_by = 'Ana'
        item.bought_at = new Date().toISOString()
        return HttpResponse.json(item)
      }),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), buy: useBuyShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.buy.mutate('srv-leche')
    })

    // Optimista: status cambia a bought de inmediato.
    await waitFor(() =>
      expect(result.current.list.data?.find((i) => i.id === 'srv-leche')?.status).toBe('bought'),
    )

    // Reconciliación: bought_by del servidor (Ana) reemplaza al optimista.
    await waitFor(() =>
      expect(result.current.list.data?.find((i) => i.id === 'srv-leche')?.bought_by).toBe('Ana'),
    )
  })

  it('revierte si el buy falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([leche])),
      http.post(`${URL}/:id/buy`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), buy: useBuyShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.buy.mutate('srv-leche')
    })

    await waitFor(() => expect(result.current.buy.isError).toBe(true))
    expect(result.current.list.data?.find((i) => i.id === 'srv-leche')?.status).toBe('pending')
  })
})

describe('useUndoShoppingItem (optimistic)', () => {
  const boughtLeche: ShoppingItem = {
    ...leche,
    status: 'bought',
    bought_by: 'Ana',
    bought_at: '2026-06-17T11:00:00Z',
  }

  it('vuelve a pending de inmediato y reconcilia con el servidor', async () => {
    const store: ShoppingItem[] = [{ ...boughtLeche }]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(`${URL}/:id/undo`, ({ params }) => {
        const item = store.find((i) => i.id === params.id)!
        item.status = 'pending'
        item.bought_by = null
        item.bought_at = null
        return HttpResponse.json(item)
      }),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), undo: useUndoShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.undo.mutate('srv-leche')
    })

    // Optimista: status vuelve a pending de inmediato.
    await waitFor(() =>
      expect(result.current.list.data?.find((i) => i.id === 'srv-leche')?.status).toBe('pending'),
    )

    // bought_by limpio tras reconciliación.
    await waitFor(() =>
      expect(result.current.list.data?.find((i) => i.id === 'srv-leche')?.bought_by).toBeNull(),
    )
  })

  it('revierte si el undo falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([boughtLeche])),
      http.post(`${URL}/:id/undo`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), undo: useUndoShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.undo.mutate('srv-leche')
    })

    await waitFor(() => expect(result.current.undo.isError).toBe(true))
    expect(result.current.list.data?.find((i) => i.id === 'srv-leche')?.status).toBe('bought')
  })
})
