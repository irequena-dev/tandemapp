import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import {
  useCreateInvitation,
  useInvitations,
  useMembers,
  useRevokeInvitation,
} from './api'
import type { Invitation, Member } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const MEMBERS_URL = 'http://localhost:8000/members'
const INVITATIONS_URL = 'http://localhost:8000/invitations'

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

const ana: Member = { id: 'mem-ana', family_id: 'fam', display_name: 'Ana' }
const carlos: Member = { id: 'mem-carlos', family_id: 'fam', display_name: 'Carlos' }

const pendingInv: Invitation = {
  id: 'inv-1',
  email_address: 'abuela@example.com',
  role: 'org:member',
  status: 'pending',
  created_at: 1718000000000,
}

describe('useMembers', () => {
  it('lista los Miembros devueltos por el backend', async () => {
    server.use(http.get(MEMBERS_URL, () => HttpResponse.json([ana, carlos])))

    const { result } = renderHook(() => useMembers(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([ana, carlos])
  })
})

describe('useInvitations', () => {
  it('lista las invitaciones pendientes', async () => {
    server.use(http.get(INVITATIONS_URL, () => HttpResponse.json([pendingInv])))

    const { result } = renderHook(() => useInvitations(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual([pendingInv])
  })
})

describe('useCreateInvitation', () => {
  it('envía invitación y reconcilia la lista', async () => {
    const store: Invitation[] = []
    server.use(
      http.get(INVITATIONS_URL, () => HttpResponse.json(store)),
      http.post(INVITATIONS_URL, async ({ request }) => {
        const body = (await request.json()) as { email_address: string }
        const inv: Invitation = {
          id: 'inv-new',
          email_address: body.email_address,
          role: 'org:member',
          status: 'pending',
          created_at: Date.now(),
        }
        store.push(inv)
        return HttpResponse.json(inv, { status: 201 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useInvitations(), create: useCreateInvitation() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.isSuccess).toBe(true))

    act(() => {
      result.current.create.mutate({ email_address: 'abuela@example.com' })
    })

    await waitFor(() =>
      expect(result.current.list.data?.map((i) => i.id)).toContain('inv-new'),
    )
  })
})

describe('useRevokeInvitation (optimistic)', () => {
  it('elimina la invitación optimistamente al revocar', async () => {
    const store: Invitation[] = [pendingInv]
    server.use(
      http.get(INVITATIONS_URL, () => HttpResponse.json(store)),
      http.delete(`${INVITATIONS_URL}/:id`, () => {
        store.length = 0
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { result } = renderHook(
      () => ({ list: useInvitations(), revoke: useRevokeInvitation() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.revoke.mutate('inv-1')
    })

    await waitFor(() => expect(result.current.list.data).toEqual([]))
  })

  it('restaura la lista si la revocación falla', async () => {
    server.use(
      http.get(INVITATIONS_URL, () => HttpResponse.json([pendingInv])),
      http.delete(`${INVITATIONS_URL}/:id`, () => new HttpResponse(null, { status: 500 })),
    )

    const { result } = renderHook(
      () => ({ list: useInvitations(), revoke: useRevokeInvitation() }),
      { wrapper: makeWrapper() },
    )
    await waitFor(() => expect(result.current.list.data).toHaveLength(1))

    act(() => {
      result.current.revoke.mutate('inv-1')
    })

    await waitFor(() => expect(result.current.revoke.isError).toBe(true))
    expect(result.current.list.data?.map((i) => i.id)).toEqual(['inv-1'])
  })
})
