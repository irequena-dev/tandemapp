import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { useToast } from '../toasts/useToast'
import type { TodayOut } from './types'

export const todayKeys = {
  all: ['today'] as const,
}

/** Datos agregados de la pantalla Hoy, acotados a la Familia del JWT. */
export function useToday() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: todayKeys.all,
    queryFn: async () => {
      // La zona horaria del dispositivo define qué es "hoy" (timestamps en UTC).
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const qs = tz ? `?tz=${encodeURIComponent(tz)}` : ''
      return apiFetch<TodayOut>(`/api/today${qs}`, { token: await getToken() })
    },
    refetchOnWindowFocus: 'always',
    refetchOnMount: 'always',
  })
}

type AdminOut = { id: string }

/** Registra una toma del héroe (POST Administración) y refresca Hoy. */
export function useMarkDose() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (pautaId: string) =>
      apiFetch<AdminOut>(`/pautas/${pautaId}/administrations`, {
        method: 'POST',
        token: await getToken(),
        body: {},
      }),
    onError: () => {
      toast.error('No se pudo registrar la toma')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: todayKeys.all })
    },
  })
}

/** Deshace la última toma del héroe (DELETE Administración) y refresca Hoy. */
export function useUndoDose() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async ({ pautaId, adminId }: { pautaId: string; adminId: string }) =>
      apiFetch<void>(`/pautas/${pautaId}/administrations/${adminId}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onError: () => {
      toast.error('No se pudo deshacer la toma')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: todayKeys.all })
    },
  })
}

/** Marca el Evento del héroe como hecho (POST done) y refresca Hoy. */
export function useMarkEventDone() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (eventId: string) =>
      apiFetch<unknown>(`/events/${eventId}/done`, {
        method: 'POST',
        token: await getToken(),
      }),
    onError: () => {
      toast.error('No se pudo marcar el evento')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: todayKeys.all })
    },
  })
}

/** Deshace el marcado del Evento del héroe (POST undo) y refresca Hoy. */
export function useUndoEvent() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (eventId: string) =>
      apiFetch<unknown>(`/events/${eventId}/undo`, {
        method: 'POST',
        token: await getToken(),
      }),
    onError: () => {
      toast.error('No se pudo deshacer el evento')
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: todayKeys.all })
    },
  })
}
