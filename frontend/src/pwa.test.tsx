import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@clerk/react', () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    when === 'signed-in' ? children : null,
  SignInButton: () => null,
  SignUpButton: () => null,
  SignIn: () => null,
  SignUp: () => null,
  UserButton: () => null,
  OrganizationSwitcher: () => null,
  useUser: () => ({ user: { fullName: 'Test User' } }),
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

import App from './App'

function renderApp(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <App />
    </MemoryRouter>,
  )
}

describe('Dashboard (Hoy)', () => {
  it('renderiza el dashboard en la ruta raíz', () => {
    renderApp('/')
    expect(screen.getByRole('heading', { name: /hoy/i, level: 1 })).toBeTruthy()
  })

  it('muestra la sección héroe "Ahora"', () => {
    renderApp('/')
    expect(screen.getByRole('region', { name: /ahora/i })).toBeTruthy()
  })
})

describe('Navegación principal', () => {
  it('muestra las 5 pestañas de navegación', () => {
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: /navegación principal/i })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(within(nav).getByText(/hoy/i)).toBeTruthy()
    expect(within(nav).getByText(/compra/i)).toBeTruthy()
    expect(within(nav).getByText(/eventos/i)).toBeTruthy()
    expect(within(nav).getByText(/hijos/i)).toBeTruthy()
    expect(within(nav).getByText(/pautas/i)).toBeTruthy()
  })

  it('marca "Hoy" como pestaña activa en la ruta raíz', () => {
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: /navegación principal/i })
    const hoyLink = within(nav).getAllByRole('link')[0]
    expect(hoyLink.className).toContain('active')
  })
})

describe('Ajustes', () => {
  it('tiene un botón de Ajustes en el header', () => {
    renderApp('/')
    expect(screen.getByRole('button', { name: /ajustes/i })).toBeTruthy()
  })

  it('abre el overlay de Ajustes al pulsar el botón', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: /ajustes/i }))
    expect(screen.getByRole('dialog', { name: /ajustes/i })).toBeTruthy()
  })

  it('el overlay muestra las secciones: Hijos, Token MCP, Miembros', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: /ajustes/i }))
    const dialog = screen.getByRole('dialog', { name: /ajustes/i })
    expect(within(dialog).getByText(/^hijos$/i)).toBeTruthy()
    expect(within(dialog).getByText(/token mcp/i)).toBeTruthy()
    expect(within(dialog).getByText(/^miembros$/i)).toBeTruthy()
  })
})

describe('PWA — Service Worker', () => {
  it('registra el service worker al iniciar', async () => {
    const registerMock = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration))
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerMock },
      configurable: true,
    })

    const { registerPWA } = await import('./lib/registerPWA')
    await registerPWA()

    expect(registerMock).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })
})
