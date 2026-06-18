import { useAuth } from '@clerk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { TodayOut } from './types'

export const todayKeys = {
  all: ['today'] as const,
}

/** Datos agregados de la pantalla Hoy, acotados a la Familia del JWT. */
export function useToday() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: todayKeys.all,
    queryFn: async () =>
      apiFetch<TodayOut>('/api/today', { token: await getToken() }),
  })
}

type AdminOut = { id: string }

/** Registra una toma del héroe (POST Administración) y refresca Hoy. */
export function useMarkDose() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (pautaId: string) =>
      apiFetch<AdminOut>(`/pautas/${pautaId}/administrations`, {
        method: 'POST',
        token: await getToken(),
        body: {},
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: todayKeys.all })
    },
  })
}

/** Deshace la última toma del héroe (DELETE Administración) y refresca Hoy. */
export function useUndoDose() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ pautaId, adminId }: { pautaId: string; adminId: string }) =>
      apiFetch<void>(`/pautas/${pautaId}/administrations/${adminId}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: todayKeys.all })
    },
  })
}
