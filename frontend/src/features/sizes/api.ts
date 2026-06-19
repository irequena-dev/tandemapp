import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { randomId } from '../../lib/randomId'
import type { CurrentSizesOut, SizeCreate, SizeOut, SizeUpdate } from './types'

/** Claves de caché para Tallas, acotadas por Hijo. */
export const sizesKeys = {
  byChild: (childId: string) => ['sizes', childId] as const,
  current: (childId: string) => ['sizes', childId, 'current'] as const,
}

type Rollback = { previous: SizeOut[] | undefined }

async function beginOptimistic(qc: QueryClient, childId: string): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: sizesKeys.byChild(childId) })
  return { previous: qc.getQueryData<SizeOut[]>(sizesKeys.byChild(childId)) }
}

function rollback(qc: QueryClient, childId: string, ctx: Rollback | undefined): void {
  if (ctx?.previous) qc.setQueryData(sizesKeys.byChild(childId), ctx.previous)
}

function settleSizes(qc: QueryClient, childId: string): void {
  void qc.invalidateQueries({ queryKey: sizesKeys.byChild(childId) })
  void qc.invalidateQueries({ queryKey: sizesKeys.current(childId) })
}

/** Lista el histórico de Tallas de un Hijo (opcionalmente filtrado por tipo). */
export function useSizes(childId: string, type?: 'clothing' | 'footwear') {
  const { getToken } = useAuth()
  const params = type ? `?type=${type}` : ''
  return useQuery({
    queryKey: [...sizesKeys.byChild(childId), type ?? 'all'],
    queryFn: async () =>
      apiFetch<SizeOut[]>(`/children/${childId}/sizes${params}`, {
        token: await getToken(),
      }),
  })
}

/** Tallas actuales (la más reciente por tipo) de un Hijo. */
export function useCurrentSizes(childId: string) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: sizesKeys.current(childId),
    queryFn: async () =>
      apiFetch<CurrentSizesOut>(`/children/${childId}/sizes/current`, {
        token: await getToken(),
      }),
  })
}

/** Alta de una Talla con inserción optimista. */
export function useCreateSize(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SizeCreate) =>
      apiFetch<SizeOut>(`/children/${childId}/sizes`, {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc, childId)
      const optimistic: SizeOut = {
        id: `optimistic-${randomId()}`,
        child_id: childId,
        recorded_by: 'optimistic',
        created_at: new Date().toISOString(),
        ...input,
      }
      qc.setQueryData<SizeOut[]>(sizesKeys.byChild(childId), (old = []) => [
        optimistic,
        ...old,
      ])
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settleSizes(qc, childId),
  })
}

/** Edición de una Talla con actualización optimista. */
export function useUpdateSize(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: SizeUpdate }) =>
      apiFetch<SizeOut>(`/children/${childId}/sizes/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: patch,
      }),
    onMutate: async ({ id, patch }) => {
      const ctx = await beginOptimistic(qc, childId)
      qc.setQueryData<SizeOut[]>(sizesKeys.byChild(childId), (old = []) =>
        old.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      )
      return ctx
    },
    onError: (_e, _vars, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settleSizes(qc, childId),
  })
}

/** Baja de una Talla con eliminación optimista. */
export function useDeleteSize(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/children/${childId}/sizes/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc, childId)
      qc.setQueryData<SizeOut[]>(sizesKeys.byChild(childId), (old = []) =>
        old.filter((s) => s.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settleSizes(qc, childId),
  })
}
