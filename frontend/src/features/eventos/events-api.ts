import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { randomId } from '../../lib/randomId'
import type { EventCreate, EventOut, EventUpdate } from './types'

/** Claves de caché de Eventos. */
export const eventsKeys = {
  all: ['events'] as const,
}

type Rollback = { previous: EventOut[] | undefined }

async function beginOptimistic(qc: QueryClient): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: eventsKeys.all })
  return { previous: qc.getQueryData<EventOut[]>(eventsKeys.all) }
}

function rollback(qc: QueryClient, ctx: Rollback | undefined): void {
  if (ctx?.previous) qc.setQueryData(eventsKeys.all, ctx.previous)
}

function settle(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: eventsKeys.all })
}

/** Lista los Eventos de la Familia (próximos, con filtros opcionales). */
export function useEvents(
  filters?: { type_id?: string; child_id?: string; member_id?: string },
) {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: [...eventsKeys.all, filters],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.type_id) params.set('type_id', filters.type_id)
      if (filters?.child_id) params.set('child_id', filters.child_id)
      if (filters?.member_id) params.set('member_id', filters.member_id)
      const qs = params.toString()
      return apiFetch<EventOut[]>(`/events${qs ? `?${qs}` : ''}`, {
        token: await getToken(),
      })
    },
  })
}

/** Alta de un Evento con inserción optimista. */
export function useCreateEvent() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EventCreate) =>
      apiFetch<EventOut>('/events', {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onMutate: async (input) => {
      const ctx = await beginOptimistic(qc)
      const optimistic: EventOut = {
        id: `optimistic-${randomId()}`,
        family_id: 'optimistic',
        title: input.title,
        date: input.date,
        time: input.time ?? null,
        event_type_id: input.event_type_id,
        event_type: { id: input.event_type_id, family_id: null, name: '', icon: 'circle', is_system: false },
        child_id: input.child_id ?? null,
        child: null,
        member_id: input.member_id ?? null,
        member: null,
        status: 'pending',
        is_overdue: false,
        series_id: null,
        created_by: '',
        created_at: new Date().toISOString(),
      }
      qc.setQueryData<EventOut[]>(eventsKeys.all, (old = []) => [...old, optimistic])
      return ctx
    },
    onError: (_e, _input, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Edición parcial de un Evento con update optimista. */
export function useUpdateEvent() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: EventUpdate }) =>
      apiFetch<EventOut>(`/events/${id}`, {
        method: 'PATCH',
        token: await getToken(),
        body: patch,
      }),
    onMutate: async ({ id, patch }) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<EventOut[]>(eventsKeys.all, (old = []) =>
        old.map((e) => (e.id === id ? { ...e, ...patch } : e)),
      )
      return ctx
    },
    onError: (_e, _vars, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Baja de un Evento con eliminación optimista. */
export function useDeleteEvent() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/events/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<EventOut[]>(eventsKeys.all, (old = []) =>
        old.filter((e) => e.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Marca un Evento como hecho con update optimista. */
export function useDoneEvent() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<EventOut>(`/events/${id}/done`, {
        method: 'POST',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<EventOut[]>(eventsKeys.all, (old = []) =>
        old.map((e) =>
          e.id === id ? { ...e, status: 'done' as const, is_overdue: false } : e,
        ),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}

/** Deshace el marcado de un Evento con update optimista. */
export function useUndoEvent() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<EventOut>(`/events/${id}/undo`, {
        method: 'POST',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await beginOptimistic(qc)
      qc.setQueryData<EventOut[]>(eventsKeys.all, (old = []) =>
        old.map((e) => (e.id === id ? { ...e, status: 'pending' as const } : e)),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => rollback(qc, ctx),
    onSettled: () => settle(qc),
  })
}
