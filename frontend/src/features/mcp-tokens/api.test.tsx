import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { useCreateMcpToken, useMcpTokens, useRevokeMcpToken } from './api'
import type { McpTokenCreated, McpTokenMeta } from './types'

// Solo se mockea la frontera de auth: `getToken` devuelve un token de prueba.
// El resto (TanStack Query, fetch) es real; la red la mockea MSW.
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/mcp-tokens'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

const active: McpTokenMeta = {
  id: 'srv-1',
  created_at: '2026-06-15T10:00:00Z',
  revoked_at: null,
}

describe('useMcpTokens', () => {
  it('lista la metadata de tokens del backend', async () => {
    server.use(http.get(URL, () => HttpResponse.json([active])))

    const { result } = renderHook(() => useMcpTokens(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([active])
  })
})

describe('useCreateMcpToken', () => {
  it('devuelve el valor en claro y reconcilia la lista con el servidor', async () => {
    const store: McpTokenMeta[] = []
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.post(URL, () => {
        const meta: McpTokenMeta = {
          id: 'srv-new',
          created_at: '2026-06-15T10:00:00Z',
          revoked_at: null,
        }
        store.unshift(meta)
        return HttpResponse.json<McpTokenCreated>(
          { id: 'srv-new', token: 'tdm_live_secret', created_at: '2026-06-15T10:00:00Z' },
          { status: 201 },
        )
      }),
    )

    const { result } = renderHook(
      () => ({ list: useMcpTokens(), create: useCreateMcpToken() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    let created: McpTokenCreated | undefined
    act(() => {
      result.current.create.mutate(undefined, { onSuccess: (c) => (created = c) })
    })

    // El valor en claro se devuelve una sola vez al crear.
    await waitFor(() => expect(created?.token).toBe('tdm_live_secret'))
    // La lista se reconcilia con la metadata del servidor.
    await waitFor(() =>
      expect(result.current.list.data?.map((t) => t.id)).toEqual(['srv-new']),
    )
  })
})

describe('useRevokeMcpToken (optimistic)', () => {
  it('quita el token de la lista al revocar', async () => {
    const store: McpTokenMeta[] = [active]
    server.use(
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:id`, () => {
        store.length = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useMcpTokens(), revoke: useRevokeMcpToken() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.revoke.mutate('srv-1')
    })

    // Optimista: desaparece de inmediato de la lista.
    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })

  it('restaura la lista si la revocación falla', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([active])),
      http.delete(`${URL}/:id`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useMcpTokens(), revoke: useRevokeMcpToken() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.revoke.mutate('srv-1')
    })

    await waitFor(() => expect(result.current.revoke.isError).toBe(true))
    // Rollback: el token sigue en la lista.
    expect(result.current.list.data?.map((t) => t.id)).toEqual(['srv-1'])
  })
})
