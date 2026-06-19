import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/server'
import { HijosTabPage } from './HijosTabPage'
import type { ChildWithMetrics } from '../children/types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/children'

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

const noa: ChildWithMetrics = {
  id: 'c2',
  family_id: 'fam',
  name: 'Noa',
  birth_date: '2021-06-15',
  avatar_color: null,
  current_height_cm: null,
  current_weight_kg: null,
  current_talla: null,
  current_talla_calzado: null,
}

describe('HijosTabPage — pestaña de sólo lectura con datos reales', () => {
  it('muestra los Hijos de la API con métricas y enlace a la ficha', async () => {
    server.use(http.get(URL, () => HttpResponse.json([mateo])))
    render(<HijosTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Mateo')).toBeTruthy()
    expect(screen.getByText('112 cm')).toBeTruthy()
    expect(screen.getByText('20 kg')).toBeTruthy()
    // La tarjeta enlaza a la ficha del Hijo.
    expect(document.querySelector('a[href="/hijos/c1"]')).toBeTruthy()
  })

  it('no muestra chips de métricas cuando son null', async () => {
    server.use(http.get(URL, () => HttpResponse.json([noa])))
    render(<HijosTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Noa')).toBeTruthy()
    expect(screen.queryByText('Altura')).toBeNull()
    expect(screen.queryByText('Peso')).toBeNull()
  })

  it('muestra el estado vacío cuando no hay Hijos', async () => {
    server.use(http.get(URL, () => HttpResponse.json([])))
    render(<HijosTabPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Aún no hay Hijos en la Familia')).toBeTruthy()
    expect(screen.queryByText('Mateo')).toBeNull()
  })
})
