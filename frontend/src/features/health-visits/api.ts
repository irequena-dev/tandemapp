import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { HealthVisit, HealthVisitInput, HealthVisitPatch } from './types'

export const healthVisitKeys = {
  byChild: (childId: string) => ['health-visits', childId] as const,
}

type Rollback = { previous: HealthVisit[] | undefined }

async function beginOptimistic(qc: QueryClient, childId: string): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: healthVisitKeys.byChild(childId) })
  return { previous: qc.getQueryData<HealthVisit[]>(healthVisitKeys.byChild(childId)) }
}

function rollback(qc: QueryClient, childId: string, ctx: Rollback | undefined): void {
  if (ctx?.previous) qc.setQueryData(healthVisitKeys.byChild(childId), ctx.previous)
}

function settle(qc: QueryClient, childId: string): void {
  void qc.invalidateQueries({ queryKey: healthVisitKeys.byChild(childId) })
}

/** Lista las Visitas médicas de un Hijo. */
export function useHealthVisits(childId: string) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: healthVisitKeys.byChild(childId),
    queryFn: async () =>
      apiFetch<HealthVisit[]>(`/children/${childId}/health-visits`, {
        token: await getToken(),
      }),
    enabled: !!childId,
  })
}

/** Registra una Visita médica con inserción optimista. */
export function useCreateHealthVisit(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: HealthVisitInput) =>
      apiFetch<HealthVisit>(`/children/${childId}/health-visits`, {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc, childId)
      const optimistic: HealthVisit = {
        id: `optimistic-${crypto.randomUUID()}`,
        child_id: childId,
        family_id: 'optimistic',
        visited_at: input.visited_at,
        diagnosis: input.diagnosis,
        notes: input.notes ?? null,
        pauta_ids: [],
        created_by: 'optimistic',
        created_at: new Date().toISOString(),
      }
      qc.setQueryData<HealthVisit[]>(healthVisitKeys.byChild(childId), (old = []) => [
        optimistic,
        ...old,
      ])
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settle(qc, childId),
  })
}

/** Edición parcial de una Visita con actualización optimista. */
export function useUpdateHealthVisit(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: HealthVisitPatch }) =>
      apiFetch<HealthVisit>(`/children/${childId}/health-visits/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: patch,
      }),
    onMutate: async ({ id, patch }) => {
      const ctx = await beginOptimistic(qc, childId)
      qc.setQueryData<HealthVisit[]>(healthVisitKeys.byChild(childId), (old = []) =>
        old.map((v) => (v.id === id ? { ...v, ...patch } : v)),
      )
      return ctx
    },
    onError: (_e, _vars, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settle(qc, childId),
  })
}

/** Borra una Visita con eliminación optimista. */
export function useDeleteHealthVisit(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/children/${childId}/health-visits/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc, childId)
      qc.setQueryData<HealthVisit[]>(healthVisitKeys.byChild(childId), (old = []) =>
        old.filter((v) => v.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settle(qc, childId),
  })
}
