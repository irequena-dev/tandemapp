import { QueryClient } from '@tanstack/react-query'

/**
 * Configuración base de TanStack Query, reutilizable por todas las fases.
 *
 * El "tiempo real" de Tándem es optimistic updates + refetch al enfocar (no
 * hay push): por eso `refetchOnWindowFocus` queda activo. `staleTime` corto
 * evita refetches en ráfaga sin sacrificar frescura.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        staleTime: 30_000,
        retry: 1,
      },
    },
  })
}
