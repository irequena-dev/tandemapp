import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/server'
import { FamiliaTabPage } from './FamiliaTabPage'
import type { ChildWithMetrics } from '../children/types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token', orgId: 'org-1' }),
  useOrganizationList: () => ({
    userMemberships: {
      data: [
        { id: 'mem-me', organization: { id: 'org-1' } },
        { id: 'mem-other', organization: { id: 'org-2' } },
      ],
    },
  }),
}))

const URL_CHILDREN = 'http://localhost:8000/children'
const URL_MEMBERS = 'http://localhost:8000/members'

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

const mateo: ChildWithMetrics = {
  id: 'c1',
  family_id: 'fam',
  name: 'Mateo',
  birth_date: '2020-03-15',
  avatar_color: 'sage',
  current_height_cm: 112,
  current_weight_kg: 20,
  current_talla: '5-6 años',
  current_talla_calzado: '29',
}

describe('FamiliaTabPage — lista Hijos y Miembros', () => {
  it('muestra las dos secciones (Hijos y Miembros) con sus tarjetas', async () => {
    server.use(
      http.get(URL_CHILDREN, () => HttpResponse.json([mateo])),
      http.get(URL_MEMBERS, () =>
        HttpResponse.json([
          { id: 'mem-me', family_id: 'fam', display_name: 'Ana' },
          { id: 'mem-juan', family_id: 'fam', display_name: 'Juan' },
        ]),
      ),
    )
    render(<FamiliaTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Mateo')).toBeTruthy()
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByText('Juan')).toBeTruthy()
    // Headers de cada sección
    expect(screen.getByRole('heading', { name: 'Hijos' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Miembros' })).toBeTruthy()
  })

  it('marca el Miembro autenticado con "Tú" y enlaza a su detalle', async () => {
    server.use(
      http.get(URL_CHILDREN, () => HttpResponse.json([])),
      http.get(URL_MEMBERS, () =>
        HttpResponse.json([
          { id: 'mem-me', family_id: 'fam', display_name: 'Ana' },
          { id: 'mem-juan', family_id: 'fam', display_name: 'Juan' },
        ]),
      ),
    )
    render(<FamiliaTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(screen.getByText('Tú')).toBeTruthy()
    // La tarjeta del Miembro autenticado enlaza a su ficha.
    expect(document.querySelector('a[href="/miembros/mem-me"]')).toBeTruthy()
    expect(document.querySelector('a[href="/miembros/mem-juan"]')).toBeTruthy()
  })

  it('muestra el empty state de Hijos cuando la Familia no tiene Hijos', async () => {
    server.use(
      http.get(URL_CHILDREN, () => HttpResponse.json([])),
      http.get(URL_MEMBERS, () =>
        HttpResponse.json([{ id: 'mem-me', family_id: 'fam', display_name: 'Ana' }]),
      ),
    )
    render(<FamiliaTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Aún no hay Hijos en la Familia')).toBeTruthy()
  })

  it('muestra el empty state de Miembros cuando solo está el Miembro autenticado', async () => {
    server.use(
      http.get(URL_CHILDREN, () => HttpResponse.json([mateo])),
      http.get(URL_MEMBERS, () =>
        HttpResponse.json([{ id: 'mem-me', family_id: 'fam', display_name: 'Ana' }]),
      ),
    )
    render(<FamiliaTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText(/Solo tú en la Familia/)).toBeTruthy()
  })

  it('mantiene la tarjeta de Hijo con métricas y enlace a su ficha', async () => {
    server.use(
      http.get(URL_CHILDREN, () => HttpResponse.json([mateo])),
      http.get(URL_MEMBERS, () => HttpResponse.json([])),
    )
    render(<FamiliaTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Mateo')).toBeTruthy()
    expect(screen.getByText('112 cm')).toBeTruthy()
    expect(document.querySelector('a[href="/hijos/c1"]')).toBeTruthy()
  })
})
