import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import {
  useShoppingItems,
  useCreateShoppingItem,
  useUpdateShoppingItem,
  useDeleteShoppingItem,
  useClearBoughtItems,
} from './api'
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
  created_at: '2026-06-17T10:00:00Z',
  updated_at: '2026-06-17T10:00:00Z',
}

const pan: ShoppingItem = {
  id: 'srv-pan',
  family_id: 'fam',
  text: 'Pan de molde',
  status: 'bought',
  created_by: 'user-1',
  created_at: '2026-06-17T09:00:00Z',
  updated_at: '2026-06-17T09:30:00Z',
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

describe('useUpdateShoppingItem (optimistic)', () => {
  it('actualiza el texto de inmediato y reconcilia', async () => {
    const store: ShoppingItem[] = [{ ...leche }]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.patch(`${URL}/:id`, async ({ request }) => {
        const body = (await request.json()) as { text: string }
        store[0] = { ...store[0], text: body.text }
        return HttpResponse.json(store[0])
      }),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), update: useUpdateShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.update.mutate({ id: 'srv-leche', text: 'Leche desnatada' })
    })

    // Optimista: texto cambiado antes de respuesta.
    await waitFor(() =>
      expect(result.current.list.data?.map((i) => i.text)).toContain(
        'Leche desnatada',
      ),
    )

    // Reconciliación.
    await waitFor(() =>
      expect(result.current.list.data?.[0].text).toBe('Leche desnatada'),
    )
  })

  it('revierte si la edición falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([leche])),
      http.patch(`${URL}/:id`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), update: useUpdateShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.update.mutate({ id: 'srv-leche', text: 'Oops' })
    })

    await waitFor(() => expect(result.current.update.isError).toBe(true))
    expect(result.current.list.data?.map((i) => i.text)).toEqual([
      'Leche entera',
    ])
  })
})

describe('useDeleteShoppingItem (optimistic)', () => {
  it('elimina el Ítem de inmediato y reconcilia', async () => {
    let store: ShoppingItem[] = [{ ...leche }]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:id`, ({ params }) => {
        store = store.filter((i) => i.id !== params['id'])
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), del: useDeleteShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(result.current.list.data).toHaveLength(1)

    act(() => {
      result.current.del.mutate('srv-leche')
    })

    // Optimista: desaparece de inmediato.
    await waitFor(() =>
      expect(result.current.list.data).toHaveLength(0),
    )
  })

  it('revierte si el borrado falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([leche])),
      http.delete(`${URL}/:id`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), del: useDeleteShoppingItem() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.del.mutate('srv-leche')
    })

    await waitFor(() => expect(result.current.del.isError).toBe(true))
    expect(result.current.list.data).toHaveLength(1)
  })
})

describe('useClearBoughtItems (optimistic)', () => {
  it('elimina solo los comprados de inmediato y reconcilia', async () => {
    let store: ShoppingItem[] = [{ ...leche }, { ...pan }]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/bought`, () => {
        store = store.filter((i) => i.status !== 'bought')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), clear: useClearBoughtItems() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))
    expect(result.current.list.data).toHaveLength(2)

    act(() => {
      result.current.clear.mutate()
    })

    // Optimista: solo queda el pendiente.
    await waitFor(() =>
      expect(result.current.list.data?.map((i) => i.text)).toEqual([
        'Leche entera',
      ]),
    )
  })

  it('revierte si limpiar falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([leche, pan])),
      http.delete(`${URL}/bought`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useShoppingItems(), clear: useClearBoughtItems() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.clear.mutate()
    })

    await waitFor(() => expect(result.current.clear.isError).toBe(true))
    expect(result.current.list.data).toHaveLength(2)
  })
})
