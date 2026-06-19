import { useState } from 'react'
import { useMembers } from './api'

/**
 * Hook que detecta si el Miembro actual necesita configurar su display_name.
 * 
 * @returns {shouldPrompt: boolean, dismiss: () => void}
 */
export function useDisplayNamePrompt() {
  const [hasDismissed, setHasDismissed] = useState(false)
  const { data: members = [], isLoading } = useMembers()

  // Derivamos si hace falta mostrar el prompt directamente de los datos
  const needsDisplayName = !isLoading && members.some((member) => !member.display_name?.trim())
  const shouldPrompt = needsDisplayName && !hasDismissed

  const dismiss = () => {
    setHasDismissed(true)
  }

  return { shouldPrompt, dismiss }
}
