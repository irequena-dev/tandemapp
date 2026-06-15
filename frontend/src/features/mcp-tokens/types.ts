/** Metadata de un token del Miembro, tal como la devuelve el listado.
 * `revoked_at` es null mientras el token esté activo. */
export type McpTokenMeta = {
  id: string
  created_at: string
  revoked_at: string | null
}

/** Respuesta del alta: el valor en claro (se muestra una sola vez) + metadata. */
export type McpTokenCreated = {
  id: string
  token: string
  created_at: string
}
