/**
 * Genera un id único también en contextos inseguros.
 *
 * `crypto.randomUUID()` solo existe en orígenes seguros (HTTPS o `localhost`);
 * al acceder por LAN en desarrollo (p. ej. `http://192.168.x.x`) no está
 * disponible y lanza `TypeError`, lo que aborta los `onMutate` optimistas antes
 * de que se haga el fetch (la petición ni llega a aparecer en Network).
 * `crypto.getRandomValues`, en cambio, sí está disponible sin contexto seguro.
 */
export function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
