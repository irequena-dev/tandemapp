import { createElement, Fragment } from 'react'
import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { randomId } from '../../lib/randomId'
import type { ToastApi } from '../toasts/useToast'
import type { Administration, Pauta, PautaInput, PautaUpdateInput } from './types'

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
        child_id: input.child_id ?? null,
        member_id: input.member_id ?? null,
        subject_name: '…',
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

/** Finaliza una Pauta (optimista: marca finished inmediatamente).
 *
 * El toast de éxito con "Deshacer" (10s, reactiva la Pauta) se dispara desde el
 * `onSuccess` del propio hook —no desde un callback pasado a `.mutate()`— porque
 * al marcar `finished` la tarjeta salta de la lista de activas a la sección
 * "Finalizadas" y se DESMONTA: los callbacks de `.mutate()` de un componente
 * desmontado no se ejecutan, así que el toast se perdía. Los de `useMutation`
 * sí se ejecutan siempre. Usamos `createElement` porque este archivo es `.ts`.
 */
export function useFinishPauta(toast?: ToastApi) {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const reactivate = useReactivatePauta()
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
    onSuccess: (data) => {
      if (!toast) return
      const toastId = toast.success(
        createElement(
          Fragment,
          null,
          createElement('strong', null, `Pauta de ${data.medication} finalizada.`),
          ' ',
          createElement(
            'button',
            {
              type: 'button',
              className: 'toast__action',
              onClick: () => {
                reactivate.mutate(data.id, {
                  onError: () => toast.error('No se pudo reactivar la Pauta.'),
                })
                toast.dismiss(toastId)
              },
            },
            'Deshacer',
          ),
        ),
        { duration: 10000 },
      )
    },
    onSettled: () => settlePautas(qc),
  })
}

/** Reactiva una Pauta finalizada (deshacer "Finalizar Pauta"). */
export function useReactivatePauta() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pautaId: string) =>
      apiFetch<Pauta>(`/pautas/${pautaId}/reactivate`, {
        method: 'POST',
        token: await getToken(),
      }),
    onMutate: async (pautaId) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<Pauta[]>(pautasKeys.all, (old = []) =>
        old.map((p) =>
          p.id === pautaId ? { ...p, status: 'active' as const } : p,
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

type UpdatePautaInput = { pautaId: string; patch: PautaUpdateInput }

/** Edita los campos de tratamiento de una Pauta activa con optimistic update. */
export function useUpdatePauta() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pautaId, patch }: UpdatePautaInput) =>
      apiFetch<Pauta>(`/pautas/${pautaId}`, {
        method: 'PATCH',
        token: await getToken(),
        body: patch,
      }),
    onMutate: async ({ pautaId, patch }) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<Pauta[]>(pautasKeys.all, (old = []) =>
        old.map((p) =>
          p.id === pautaId ? { ...p, ...patch } : p,
        ),
      )
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, ctx),
    onSettled: () => settlePautas(qc),
  })
}

/** Elimina una Pauta activa con optimistic update. */
export function useDeletePauta() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pautaId: string) =>
      apiFetch<void>(`/pautas/${pautaId}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (pautaId) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<Pauta[]>(pautasKeys.all, (old = []) =>
        old.filter((p) => p.id !== pautaId),
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
