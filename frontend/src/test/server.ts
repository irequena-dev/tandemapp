import { setupServer } from 'msw/node'

/**
 * Servidor MSW compartido por los tests. Mockea la red en la frontera HTTP
 * (sin tocar los internals de TanStack Query). Cada test registra sus propios
 * handlers con `server.use(...)`; `setup.ts` los resetea entre tests.
 */
export const server = setupServer()
