import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { server } from './test/server'

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
  useOrganizationList: () => ({ organizationList: [], setActive: async () => {} }),
}))

import App from './App'

const CALM_TODAY = {
  hero: null,
  timeline: [],
  summary: {
    shopping_pending_count: 0,
    pautas_active_count: 0,
    pautas_finished_count: 0,
    next_medical_event: null,
    children_status: 'up_to_date',
  },
}

function renderApp(initialRoute = '/') {
  server.use(
    http.get('http://localhost:8000/api/today', () => HttpResponse.json(CALM_TODAY)),
    http.get('http://localhost:8000/api/shopping-items', () => HttpResponse.json([])),
    http.get('http://localhost:8000/members', () => HttpResponse.json([])),
    http.get('http://localhost:8000/invitations', () => HttpResponse.json([])),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Dashboard (Hoy)', () => {
  it('renderiza el dashboard en la ruta raíz', () => {
    renderApp('/')
    expect(screen.getByRole('heading', { name: /hoy/i, level: 1 })).toBeTruthy()
  })

  it('muestra la sección héroe "Ahora"', async () => {
    renderApp('/')
    await screen.findByRole('region', { name: /ahora/i })
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
    server.use(
      http.get('http://localhost:8000/members', () => HttpResponse.json([])),
      http.get('http://localhost:8000/invitations', () => HttpResponse.json([])),
    )
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: /ajustes/i }))
    expect(screen.getByRole('dialog', { name: /ajustes/i })).toBeTruthy()
  })

  it('el overlay muestra las secciones: Hijos, Token MCP, Miembros', async () => {
    server.use(
      http.get('http://localhost:8000/members', () => HttpResponse.json([])),
      http.get('http://localhost:8000/invitations', () => HttpResponse.json([])),
    )
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
