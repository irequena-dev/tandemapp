/**
 * Copia texto al portapapeles con fallback para contextos inseguros.
 *
 * `navigator.clipboard` solo está disponible en orígenes seguros (HTTPS o
 * `localhost`); al acceder por LAN en desarrollo (p. ej. `http://192.168.x.x`)
 * no existe y lanza. En ese caso caemos a la API legacy con un `<textarea>`
 * temporal y `document.execCommand('copy')`.
 *
 * Devuelve `true` si la copia tuvo éxito.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Seguimos por el fallback clásico.
    }
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    textarea.style.top = '0'
    textarea.style.left = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}
