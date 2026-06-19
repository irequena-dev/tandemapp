import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Mockeamos Clerk para renderizar el estado "sin sesión" de forma aislada,
// sin proveedor real ni llamadas de red.
vi.mock('@clerk/react', () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    when === 'signed-out' ? children : null,
  SignInButton: () => <button>Iniciar sesión</button>,
  SignUpButton: () => <button>Crear cuenta</button>,
  SignIn: () => null,
  SignUp: () => null,
  UserButton: () => null,
  OrganizationSwitcher: () => null,
  useUser: () => ({ user: null }),
  useAuth: () => ({ getToken: async () => null }),
  useOrganizationList: () => ({ organizationList: [], setActive: async () => {} }),
}))

import App from './App'

describe('App', () => {
  it('muestra la pantalla de bienvenida cuando no hay sesión', () => {
    // `App` lanza hooks de React Query (p. ej. `useDisplayNamePrompt`) aunque
    // estemos en estado signed-out, así que necesita un `QueryClientProvider`.
    const queryClient = new QueryClient()
    render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    )
    expect(
      screen.getByText(/Comparte la carga mental de la crianza/i),
    ).toBeTruthy()
  })
})
