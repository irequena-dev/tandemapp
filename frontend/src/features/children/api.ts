import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { Child, ChildInput, ChildPatch } from './types'

/** Claves de caché de Hijos (una sola lista por Familia activa). */
export const childrenKeys = {
  all: ['children'] as const,
}

/** Contexto que viaja entre `onMutate` y `onError` para poder revertir. */
type Rollback = { previous: Child[] | undefined }

/**
 * Snapshot + cancelación previas a una mutación optimista. Devuelve el callback
 * de rollback que restaura la caché si la mutación falla. Es el patrón base que
 * reutilizan create/update/delete (y, más adelante, otras entidades).
 */
async function beginOptimistic(qc: QueryClient): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: childrenKeys.all })
  return { previous: qc.getQueryData<Child[]>(childrenKeys.all) }
}

function rollback(qc: QueryClient, ctx: Rollback | undefined): void {
  if (ctx?.previous) qc.setQueryData(childrenKeys.all, ctx.previous)
}

function settleChildren(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: childrenKeys.all })
}

/** Lista los Hijos de la Familia autenticada. */
export function useChildren() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: childrenKeys.all,
    queryFn: async () =>
      apiFetch<Child[]>('/children', { token: await getToken() }),
  })
}

/** Alta de un Hijo con inserción optimista en la lista. */
export function useCreateChild() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: ChildInput) =>
      apiFetch<Child>('/children', {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc)
      const optimistic: Child = {
        id: `optimistic-${crypto.randomUUID()}`,
        family_id: 'optimistic',
        name: input.name,
        birth_date: input.birth_date,
        avatar_color: input.avatar_color ?? null,
      }
      qc.setQueryData<Child[]>(childrenKeys.all, (old = []) => [...old, optimistic])
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, ctx),
    onSettled: () => settleChildren(qc),
  })
}

/** Edición parcial de un Hijo con actualización optimista. */
export function useUpdateChild() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ChildPatch }) =>
      apiFetch<Child>(`/children/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: patch,
      }),
    onMutate: async ({ id, patch }) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<Child[]>(childrenKeys.all, (old = []) =>
        old.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      )
      return ctx
    },
    onError: (_e, _vars, ctx) => rollback(qc, ctx),
    onSettled: () => settleChildren(qc),
  })
}

/** Baja de un Hijo con eliminación optimista de la lista. */
export function useDeleteChild() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/children/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<Child[]>(childrenKeys.all, (old = []) =>
        old.filter((c) => c.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settleChildren(qc),
  })
}
