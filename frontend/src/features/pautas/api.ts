import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { randomId } from '../../lib/randomId'
import type { Administration, Pauta, PautaInput } from './types'

/** Claves de caché de Pautas. */
export const pautasKeys = {
  all: ['pautas'] as const,
  filtered: (params: Record<string, string>) => ['pautas', params] as const,
}

type Rollback = { previous: Pauta[] | undefined }

async function beginOptimistic(qc: QueryClient): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: pautasKeys.all })
  return { previous: qc.getQueryData<Pauta[]>(pautasKeys.all) }
}

function rollback(qc: QueryClient, ctx: Rollback | undefined): void {
  if (ctx?.previous) qc.setQueryData(pautasKeys.all, ctx.previous)
}

function settlePautas(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: pautasKeys.all })
}

/** Lista las Pautas de la Familia (filtros opcionales). */
export function usePautas(params?: { status?: string; child_id?: string }) {
  const { getToken } = useAuth()
  const search = new URLSearchParams()
  if (params?.status) search.set('status', params.status)
  if (params?.child_id) search.set('child_id', params.child_id)
  const qs = search.toString()
  const path = `/pautas${qs ? `?${qs}` : ''}`

  return useQuery({
    queryKey: qs ? pautasKeys.filtered(Object.fromEntries(search)) : pautasKeys.all,
    queryFn: async () => apiFetch<Pauta[]>(path, { token: await getToken() }),
  })
}

/** Inicia una nueva Pauta con inserción optimista. */
export function useCreatePauta() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: PautaInput) =>
      apiFetch<Pauta>('/pautas', {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc)
      const now = new Date()
      const optimistic: Pauta = {
        id: `optimistic-${randomId()}`,
        family_id: 'optimistic',
        child_id: input.child_id,
        medication: input.medication,
        dose: input.dose,
        interval_hours: input.interval_hours,
        duration_days: input.duration_days,
        started_at: now.toISOString(),
        ends_at: new Date(
          now.getTime() + input.duration_days * 86_400_000,
        ).toISOString(),
        status: 'active',
        health_visit_id: input.health_visit_id ?? null,
        created_by: 'optimistic',
        created_at: now.toISOString(),
        day_number: 1,
        next_dose_at: new Date(
          now.getTime() + input.interval_hours * 3_600_000,
        ).toISOString(),
        todays_administrations: [],
      }
      qc.setQueryData<Pauta[]>(pautasKeys.all, (old = []) => [optimistic, ...old])
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, ctx),
    onSettled: () => settlePautas(qc),
  })
}

/** Finaliza una Pauta (optimista: marca finished inmediatamente). */
export function useFinishPauta() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pautaId: string) =>
      apiFetch<Pauta>(`/pautas/${pautaId}/finish`, {
        method: 'POST',
        token: await getToken(),
      }),
    onMutate: async (pautaId) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<Pauta[]>(pautasKeys.all, (old = []) =>
        old.map((p) =>
          p.id === pautaId
            ? { ...p, status: 'finished' as const, next_dose_at: null }
            : p,
        ),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settlePautas(qc),
  })
}

/** Registra una Administración (marca toma) con optimistic update. */
export function useCreateAdministration() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pautaId: string) =>
      apiFetch<Administration>(`/pautas/${pautaId}/administrations`, {
        method: 'POST',
        token: await getToken(),
        body: {},
      }),
    onMutate: async (pautaId) => {
      const ctx = await beginOptimistic(qc)
      const now = new Date().toISOString()
      qc.setQueryData<Pauta[]>(pautasKeys.all, (old = []) =>
        old.map((p) => {
          if (p.id !== pautaId) return p
          const optimisticAdmin: Administration = {
            id: `optimistic-${randomId()}`,
            pauta_id: pautaId,
            administered_at: now,
            administered_by: 'optimistic',
            member_name: null,
            created_at: now,
          }
          return {
            ...p,
            next_dose_at: new Date(
              Date.now() + p.interval_hours * 3_600_000,
            ).toISOString(),
            todays_administrations: [
              ...p.todays_administrations,
              optimisticAdmin,
            ],
          }
        }),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settlePautas(qc),
  })
}

type DeleteAdminInput = { pautaId: string; adminId: string }

/** Borra una Administración (deshacer toma) con optimistic update. */
export function useDeleteAdministration() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pautaId, adminId }: DeleteAdminInput) =>
      apiFetch<void>(`/pautas/${pautaId}/administrations/${adminId}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async ({ pautaId, adminId }) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<Pauta[]>(pautasKeys.all, (old = []) =>
        old.map((p) => {
          if (p.id !== pautaId) return p
          return {
            ...p,
            todays_administrations: p.todays_administrations.filter(
              (a) => a.id !== adminId,
            ),
          }
        }),
      )
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, ctx),
    onSettled: () => settlePautas(qc),
  })
}
