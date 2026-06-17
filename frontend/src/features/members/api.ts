import { useAuth } from '@clerk/react'
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import type { Invitation, InvitationCreate, Member } from './types'

export const membersKeys = {
  all: ['members'] as const,
}

export const invitationsKeys = {
  all: ['invitations'] as const,
}

/** Lista los Miembros de la Familia autenticada. */
export function useMembers() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: membersKeys.all,
    queryFn: async () =>
      apiFetch<Member[]>('/members', { token: await getToken() }),
  })
}

/** Lista las invitaciones pendientes de la Familia. */
export function useInvitations() {
  const { getToken } = useAuth()
  return useQuery({
    queryKey: invitationsKeys.all,
    queryFn: async () =>
      apiFetch<Invitation[]>('/invitations', { token: await getToken() }),
  })
}

type InvitationRollback = { previous: Invitation[] | undefined }

async function snapshotInvitations(qc: QueryClient): Promise<InvitationRollback> {
  await qc.cancelQueries({ queryKey: invitationsKeys.all })
  return { previous: qc.getQueryData<Invitation[]>(invitationsKeys.all) }
}

/** Envía una invitación por email. Reconcilia la lista al asentar. */
export function useCreateInvitation() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: InvitationCreate) =>
      apiFetch<Invitation>('/invitations', {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: invitationsKeys.all })
    },
  })
}

/** Revoca una invitación con eliminación optimista. */
export function useRevokeInvitation() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch<void>(`/invitations/${id}`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onMutate: async (id) => {
      const ctx = await snapshotInvitations(qc)
      qc.setQueryData<Invitation[]>(invitationsKeys.all, (old = []) =>
        old.filter((inv) => inv.id !== id),
      )
      return ctx
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(invitationsKeys.all, ctx.previous)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: invitationsKeys.all })
    },
  })
}
