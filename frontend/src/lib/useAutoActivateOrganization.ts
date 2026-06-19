import { useEffect } from 'react'
import { useAuth, useOrganizationList } from '@clerk/react'

/**
 * Activa automáticamente la organización del usuario tras iniciar sesión si no
 * hay ninguna activa.
 *
 * Sin esto, una sesión nueva —p. ej. desde el móvil en la red local— llega sin
 * organización activa y el JWT de Clerk no incluye el claim de organización
 * (`org_id` / `o.id`). El backend responde entonces 403 a todo handler que
 * dependa de `current_family_id` (crear un ítem de compra, dar de alta un
 * hijo...), mientras que los que solo usan `current_member_id` (marcar compra)
 * sí funcionan. En navegadores con una organización previamente activa Clerk la
 * recuerda solo y no hace falta; este efecto cubre el caso de sesión limpia.
 */
export function useAutoActivateOrganization(): void {
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const { organizationList, setActive } = useOrganizationList()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    if (orgId) return // ya hay una Familia activa
    if (!organizationList || organizationList.length === 0) return

    // App de familia única: activa la primera organización disponible. Si el
    // usuario perteneciera a varias, aquí habría que ofrecer un selector.
    const [firstOrg] = organizationList
    void setActive({ organization: firstOrg.id })
  }, [isLoaded, isSignedIn, orgId, organizationList, setActive])
}
