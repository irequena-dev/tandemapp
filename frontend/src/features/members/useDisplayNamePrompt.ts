import { useEffect, useState } from 'react'
import { useMembers } from './api'

/**
 * Hook que detecta si el Miembro actual necesita configurar su display_name.
 * 
 * @returns {shouldPrompt: boolean, dismiss: () => void}
 */
export function useDisplayNamePrompt() {
  const [shouldPrompt, setShouldPrompt] = useState(false)
  const [hasChecked, setHasChecked] = useState(false)
  const { data: members = [], isLoading } = useMembers()

  useEffect(() => {
    if (isLoading || hasChecked) return

    // Buscar si algún miembro tiene display_name vacío
    const needsDisplayName = members.some((member) => !member.display_name?.trim())
    
    if (needsDisplayName) {
      setShouldPrompt(true)
    }
    
    setHasChecked(true)
  }, [members, isLoading, hasChecked])

  const dismiss = () => {
    setShouldPrompt(false)
  }

  return { shouldPrompt, dismiss }
}
