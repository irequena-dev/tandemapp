import { useAuth } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
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
