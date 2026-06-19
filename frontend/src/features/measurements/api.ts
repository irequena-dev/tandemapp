import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { randomId } from '../../lib/randomId'
import type {
  CurrentMeasurements,
  Measurement,
  MeasurementInput,
  MeasurementPatch,
} from './types'

export const measurementKeys = {
  all: (childId: string) => ['measurements', childId] as const,
  byType: (childId: string, type: string) =>
    ['measurements', childId, type] as const,
  current: (childId: string) => ['measurements', childId, 'current'] as const,
}

type Rollback = { previous: Measurement[] | undefined }

async function beginOptimistic(
  qc: QueryClient,
  childId: string,
): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: measurementKeys.all(childId) })
  return {
    previous: qc.getQueryData<Measurement[]>(measurementKeys.all(childId)),
  }
}

function rollback(
  qc: QueryClient,
  childId: string,
  ctx: Rollback | undefined,
): void {
  if (ctx?.previous)
    qc.setQueryData(measurementKeys.all(childId), ctx.previous)
}

function settleMeasurements(qc: QueryClient, childId: string): void {
  void qc.invalidateQueries({ queryKey: measurementKeys.all(childId) })
  void qc.invalidateQueries({ queryKey: measurementKeys.current(childId) })
}

/** Histórico de Medidas de un Hijo (opcionalmente filtrado por tipo). */
export function useMeasurements(childId: string, type?: 'height' | 'weight') {
  const { getToken } = useAuth()
  const queryKey = type
    ? measurementKeys.byType(childId, type)
    : measurementKeys.all(childId)
  return useQuery({
    queryKey,
    queryFn: async () => {
      const params = type ? `?type=${type}` : ''
      return apiFetch<Measurement[]>(
        `/children/${childId}/measurements${params}`,
        { token: await getToken() },
      )
    },
    enabled: !!childId,
  })
}

/** Valores más recientes de cada tipo para un Hijo. */
export function useCurrentMeasurements(childId: string) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: measurementKeys.current(childId),
    queryFn: async () =>
      apiFetch<CurrentMeasurements>(
        `/children/${childId}/measurements/current`,
        { token: await getToken() },
      ),
    enabled: !!childId,
  })
}

/** Alta de una Medida con inserción optimista. */
export function useCreateMeasurement(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: MeasurementInput) =>
      apiFetch<Measurement>(`/children/${childId}/measurements`, {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc, childId)
      const optimistic: Measurement = {
        id: `optimistic-${randomId()}`,
        child_id: childId,
        recorded_by: 'optimistic',
        created_at: new Date().toISOString(),
        ...input,
      }
      qc.setQueryData<Measurement[]>(
        measurementKeys.all(childId),
        (old = []) => [optimistic, ...old],
      )
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settleMeasurements(qc, childId),
  })
}

/** Corrección parcial de una Medida. */
export function useUpdateMeasurement(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: MeasurementPatch }) =>
      apiFetch<Measurement>(
        `/children/${childId}/measurements/${id}`,
        { method: 'PATCH', token: await getToken(), body: patch },
      ),
    onMutate: async ({ id, patch }) => {
      const ctx = await beginOptimistic(qc, childId)
      qc.setQueryData<Measurement[]>(
        measurementKeys.all(childId),
        (old = []) => old.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      )
      return ctx
    },
    onError: (_e, _vars, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settleMeasurements(qc, childId),
  })
}

/** Borrado de una Medida con eliminación optimista. */
export function useDeleteMeasurement(childId: string) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/children/${childId}/measurements/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc, childId)
      qc.setQueryData<Measurement[]>(
        measurementKeys.all(childId),
        (old = []) => old.filter((m) => m.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, childId, ctx),
    onSettled: () => settleMeasurements(qc, childId),
  })
}
