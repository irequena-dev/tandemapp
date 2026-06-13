import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Mockeamos Clerk para renderizar el estado "sin sesión" de forma aislada,
// sin proveedor real ni llamadas de red.
vi.mock('@clerk/react', () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    when === 'signed-out' ? children : null,
  SignInButton: () => <button>Iniciar sesión</button>,
  SignUpButton: () => <button>Crear cuenta</button>,
  UserButton: () => null,
  OrganizationSwitcher: () => null,
  useUser: () => ({ user: null }),
  useAuth: () => ({ getToken: async () => null }),
}))

import App from './App'

describe('App', () => {
  it('muestra la pantalla de bienvenida cuando no hay sesión', () => {
    render(<App />)
    expect(screen.getByText(/Inicia sesión o crea una cuenta/i)).toBeTruthy()
  })
})
