import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ToastProvider } from '../toasts/toasts'
import { SizesSection } from './SizesSection'
import type { CurrentSizesOut, SizeOut } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const BASE = 'http://localhost:8000/children/child-1/sizes'

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
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

  it('pide confirmación antes de borrar una Talla del historial y ofrece Deshacer', async () => {
    const current: CurrentSizesOut = { clothing, footwear: null }
    const deletes: string[] = []
    const created: Record<string, unknown>[] = []
    server.use(
      http.get(BASE, () => HttpResponse.json([clothing])),
      http.get(`${BASE}/current`, () => HttpResponse.json(current)),
      http.delete(`${BASE}/:id`, ({ params }) => {
        deletes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
      http.post(BASE, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        created.push(body)
        return HttpResponse.json({ ...clothing, ...body }, { status: 201 })
      }),
    )

    render(<SizesSection childId="child-1" />, { wrapper: Wrapper })

    // Abrimos el historial para reaching the delete button.
    await waitFor(() => expect(screen.getByText('5-6 años')).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: /Ver historial/ }))

    // El botón de borrar no dispara el borrado directamente.
    fireEvent.click(screen.getByRole('button', { name: 'Borrar Talla' }))
    expect(deletes).toHaveLength(0)

    // Confirmación inline.
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))
    await waitFor(() => expect(deletes).toEqual(['sz-c1']))

    // Toast con Deshacer que re-crea la talla.
    const undo = await screen.findByRole('button', { name: 'Deshacer' })
    fireEvent.click(undo)
    await waitFor(() => expect(created.length).toBe(1))
    expect(created[0]).toMatchObject({ type: 'clothing', label: '5-6 años' })
  })
})
