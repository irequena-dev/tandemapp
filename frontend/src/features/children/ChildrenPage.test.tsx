import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ChildrenPage } from './ChildrenPage'
import type { ChildWithMetrics } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/children'

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const lucas: ChildWithMetrics = {
  id: 'child-1',
  family_id: 'fam-1',
  name: 'Lucas',
  birth_date: '2019-04-10',
  avatar_color: 'sage',
  current_height_cm: 95,
  current_weight_kg: 14.5,
  current_talla: '5-6 años',
  current_talla_calzado: '28',
}

const noa: ChildWithMetrics = {
  id: 'child-2',
  family_id: 'fam-1',
  name: 'Noa',
  birth_date: '2021-06-15',
  avatar_color: null,
  current_height_cm: null,
  current_weight_kg: null,
  current_talla: null,
  current_talla_calzado: null,
}

describe('ChildrenPage — métricas actuales en cards', () => {
  it('muestra height/weight/talla/calzado en el card de Hijo', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([lucas])),
    )

    render(<ChildrenPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Lucas')).toBeDefined()
    expect(screen.getByText('95 cm')).toBeDefined()
    expect(screen.getByText('14.5 kg')).toBeDefined()
    expect(screen.getByText('5-6 años')).toBeDefined()
    expect(screen.getByText('28')).toBeDefined()
  })

  it('no muestra chips de métricas cuando son null', async () => {
    server.use(
      http.get(URL, () => HttpResponse.json([noa])),
    )

    render(<ChildrenPage />, { wrapper: Wrapper })

    expect(await screen.findByText('Noa')).toBeDefined()
    expect(screen.queryByText('Altura')).toBeNull()
    expect(screen.queryByText('Peso')).toBeNull()
  })
})
