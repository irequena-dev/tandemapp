import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { SizesSection } from './SizesSection'
import type { CurrentSizesOut, SizeOut } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const BASE = 'http://localhost:8000/children/child-1/sizes'

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const clothing: SizeOut = {
  id: 'sz-c1',
  child_id: 'child-1',
  type: 'clothing',
  label: '5-6 años',
  recorded_at: '2026-06-01',
  recorded_by: 'user-1',
  created_at: '2026-06-01T10:00:00Z',
}

const footwear: SizeOut = {
  id: 'sz-f1',
  child_id: 'child-1',
  type: 'footwear',
  label: '29',
  recorded_at: '2026-06-01',
  recorded_by: 'user-1',
  created_at: '2026-06-01T10:00:00Z',
}

describe('SizesSection', () => {
  it('muestra la Talla y el Calzado actuales', async () => {
    const current: CurrentSizesOut = { clothing, footwear }
    server.use(
      http.get(BASE, () => HttpResponse.json([clothing, footwear])),
      http.get(`${BASE}/current`, () => HttpResponse.json(current)),
    )

    render(<SizesSection childId="child-1" />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByText('5-6 años')).toBeDefined()
      expect(screen.getByText('29')).toBeDefined()
    })

    // Labels: clothing → "Talla", footwear → "Calzado"
    expect(screen.getByText('Talla')).toBeDefined()
    expect(screen.getByText('Calzado')).toBeDefined()
  })

  it('muestra "Sin registro" cuando no hay Tallas', async () => {
    const current: CurrentSizesOut = { clothing: null, footwear: null }
    server.use(
      http.get(BASE, () => HttpResponse.json([])),
      http.get(`${BASE}/current`, () => HttpResponse.json(current)),
    )

    render(<SizesSection childId="child-1" />, { wrapper: Wrapper })

    await waitFor(() => {
      const empties = screen.getAllByText('Sin registro')
      expect(empties.length).toBe(2)
    })
  })

  it('muestra el título de sección "Tallas"', async () => {
    const current: CurrentSizesOut = { clothing: null, footwear: null }
    server.use(
      http.get(BASE, () => HttpResponse.json([])),
      http.get(`${BASE}/current`, () => HttpResponse.json(current)),
    )

    render(<SizesSection childId="child-1" />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(screen.getByText('Tallas')).toBeDefined()
    })
  })
})
