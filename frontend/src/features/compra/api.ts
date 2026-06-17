import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { ShoppingItem, ShoppingItemInput } from './types'

/** Claves de caché de Ítems de compra (una sola lista por Familia activa). */
export const shoppingKeys = {
  all: ['shopping-items'] as const,
}

type Rollback = { previous: ShoppingItem[] | undefined }

async function beginOptimistic(qc: QueryClient): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: shoppingKeys.all })
  return { previous: qc.getQueryData<ShoppingItem[]>(shoppingKeys.all) }
}

function rollback(qc: QueryClient, ctx: Rollback | undefined): void {
  if (ctx?.previous) qc.setQueryData(shoppingKeys.all, ctx.previous)
}

function settle(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: shoppingKeys.all })
}

/** Lista los Ítems de compra de la Familia autenticada. */
export function useShoppingItems() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: shoppingKeys.all,
    queryFn: async () =>
      apiFetch<ShoppingItem[]>('/api/shopping-items', {
        token: await getToken(),
      }),
  })
}

/** Alta de un Ítem de compra con inserción optimista en la lista. */
export function useCreateShoppingItem() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ShoppingItemInput) =>
      apiFetch<ShoppingItem>('/api/shopping-items', {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc)
      const optimistic: ShoppingItem = {
        id: `optimistic-${crypto.randomUUID()}`,
        family_id: 'optimistic',
        text: input.text,
        status: 'pending',
        created_by: 'optimistic',
        bought_by: null,
        bought_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      qc.setQueryData<ShoppingItem[]>(shoppingKeys.all, (old = []) => [
        ...old,
        optimistic,
      ])
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Marca un Ítem como comprado (optimistic: status→bought de inmediato). */
export function useBuyShoppingItem() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) =>
      apiFetch<ShoppingItem>(`/api/shopping-items/${itemId}/buy`, {
        method: 'POST',
        token: await getToken(),
      }),
    onMutate: async (itemId) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<ShoppingItem[]>(shoppingKeys.all, (old = []) =>
        old.map((i) =>
          i.id === itemId
            ? {
                ...i,
                status: 'bought' as const,
                bought_by: 'optimistic',
                bought_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }
            : i,
        ),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Deshace la compra de un Ítem (optimistic: status→pending de inmediato). */
export function useUndoShoppingItem() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (itemId: string) =>
      apiFetch<ShoppingItem>(`/api/shopping-items/${itemId}/undo`, {
        method: 'POST',
        token: await getToken(),
      }),
    onMutate: async (itemId) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<ShoppingItem[]>(shoppingKeys.all, (old = []) =>
        old.map((i) =>
          i.id === itemId
            ? {
                ...i,
                status: 'pending' as const,
                bought_by: null,
                bought_at: null,
                updated_at: new Date().toISOString(),
              }
            : i,
        ),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}
