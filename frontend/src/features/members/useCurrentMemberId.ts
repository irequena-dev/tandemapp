import { useAuth, useOrganizationList } from '@clerk/react'

/**
 * Devuelve el `id` del Miembro autenticado dentro de la Familia activa.
 *
 * El backend materializa `members.id` con el claim `sub` del JWT de Clerk, que
 * para una sesión de organización es el id de membresía (`mem_…`). Lo buscamos
 * entre las membresías del usuario cuya organización coincide con la activa.
 */
export function useCurrentMemberId(): string | undefined {
  const { orgId } = useAuth()
  const { userMemberships } = useOrganizationList({ userMemberships: true })
  const membership = userMemberships?.data?.find((um) => um.organization.id === orgId)
  return membership?.id
}
