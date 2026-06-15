import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { McpTokenCreated, McpTokenMeta } from './types'

/** Claves de caché de tokens MCP (una lista por Miembro autenticado). */
export const mcpTokensKeys = {
  all: ['mcp-tokens'] as const,
}

/** Snapshot previo a una mutación optimista, para revertir si falla. */
type Rollback = { previous: McpTokenMeta[] | undefined }

async function snapshotForOptimism(qc: QueryClient): Promise<Rollback> {
  await qc.cancelQueries({ queryKey: mcpTokensKeys.all })
  return { previous: qc.getQueryData<McpTokenMeta[]>(mcpTokensKeys.all) }
}

/** Lista los tokens del Miembro autenticado (metadata, nunca el valor en claro). */
export function useMcpTokens() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: mcpTokensKeys.all,
    queryFn: async () =>
      apiFetch<McpTokenMeta[]>('/mcp-tokens', { token: await getToken() }),
  })
}

/**
 * Genera un token MCP. El valor en claro se devuelve una sola vez (en el
 * resultado de la mutación); la lista se reconcilia al asentar.
 */
export function useCreateMcpToken() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      apiFetch<McpTokenCreated>('/mcp-tokens', {
        method: 'POST',
        token: await getToken(),
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: mcpTokensKeys.all }),
  })
}

/** Revoca un token con eliminación optimista de la lista (y rollback si falla). */
export function useRevokeMcpToken() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/mcp-tokens/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await snapshotForOptimism(qc)
      qc.setQueryData<McpTokenMeta[]>(mcpTokensKeys.all, (old = []) =>
        old.filter((t) => t.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(mcpTokensKeys.all, ctx.previous)
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: mcpTokensKeys.all }),
  })
}
