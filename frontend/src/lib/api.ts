// En desarrollo el backend corre en el mismo host que sirve la web (aunque sea
// la IP de la red local), así que derivamos su host del origen actual. En prod
// se fija con VITE_API_URL.
const API_URL =
  import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:8000`

/** Error de una respuesta HTTP no satisfactoria, con su código de estado. */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

type ApiRequest = Omit<RequestInit, 'body'> & {
  /** JWT de Clerk; `null` si no hay sesión (el backend responderá 401). */
  token: string | null
  body?: unknown
}

/**
 * Cliente REST mínimo: inyecta el token de Clerk, serializa el cuerpo a JSON y
 * lanza `ApiError` si la respuesta no es satisfactoria. Devuelve `undefined`
 * para respuestas sin contenido (204).
 */
export async function apiFetch<T>(
  path: string,
  { token, body, headers, ...init }: ApiRequest,
): Promise<T> {
  const resp = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (!resp.ok) throw new ApiError(resp.status)
  if (resp.status === 204) return undefined as T
  return (await resp.json()) as T
}
