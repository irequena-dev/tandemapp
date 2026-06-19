import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { randomId } from '../../lib/randomId'
import type { EventTypeCreate, EventTypeOut, EventTypeUpdate } from './types'

/** Claves de caché de Tipos de Evento (una lista por Familia activa). */
export const eventTypesKeys = {
  all: ['event-types'] as const,
}

type Rollback = { previous: EventTypeOut[] | undefined }

async function beginOptimistic(qc: QueryClient): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: eventTypesKeys.all })
  return { previous: qc.getQueryData<EventTypeOut[]>(eventTypesKeys.all) }
}

function rollback(qc: QueryClient, ctx: Rollback | undefined): void {
  if (ctx?.previous) qc.setQueryData(eventTypesKeys.all, ctx.previous)
}

function settle(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: eventTypesKeys.all })
}

/** Lista los Tipos de Evento visibles: base + personalizados de la Familia. */
export function useEventTypes() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: eventTypesKeys.all,
    queryFn: async () =>
      apiFetch<EventTypeOut[]>('/event-types', { token: await getToken() }),
  })
}

/** Alta de un Tipo de Evento personalizado con inserción optimista. */
export function useCreateEventType() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EventTypeCreate) =>
      apiFetch<EventTypeOut>('/event-types', {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc)
      const optimistic: EventTypeOut = {
        id: `optimistic-${randomId()}`,
        family_id: 'optimistic',
        name: input.name,
        icon: input.icon ?? 'circle',
        is_system: false,
      }
      qc.setQueryData<EventTypeOut[]>(eventTypesKeys.all, (old = []) => [
        ...old,
        optimistic,
      ])
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Edición parcial de un Tipo de Evento personalizado con update optimista. */
export function useUpdateEventType() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EventTypeUpdate }) =>
      apiFetch<EventTypeOut>(`/event-types/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: patch,
      }),
    onMutate: async ({ id, patch }) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<EventTypeOut[]>(eventTypesKeys.all, (old = []) =>
        old.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      )
      return ctx
    },
    onError: (_e, _vars, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Baja de un Tipo de Evento personalizado con eliminación optimista. */
export function useDeleteEventType() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/event-types/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<EventTypeOut[]>(eventTypesKeys.all, (old = []) =>
        old.filter((t) => t.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}
