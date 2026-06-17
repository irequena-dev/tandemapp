import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { HoyPage } from './HoyPage'
import type { TodayOut } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const API = 'http://localhost:8000/api/today'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

const CALM_RESPONSE: TodayOut = {
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

describe('HoyPage — estado calmado', () => {
  it('muestra "Nada urgente ahora · todo en orden" sin datos de dominio', async () => {
    server.use(http.get(API, () => HttpResponse.json(CALM_RESPONSE)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText(/Nada urgente ahora/)).toBeTruthy(),
    )
    expect(screen.getByText(/todo en orden/)).toBeTruthy()
  })

  it('muestra las tarjetas de resumen con contadores en cero', async () => {
    server.use(http.get(API, () => HttpResponse.json(CALM_RESPONSE)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText('Lista vacía')).toBeTruthy(),
    )
    expect(screen.getByText(/0 activas/)).toBeTruthy()
    expect(screen.getByText(/0 finalizadas/)).toBeTruthy()
    expect(screen.getByText('Sin citas próximas')).toBeTruthy()
    expect(screen.getByText('Al día')).toBeTruthy()
  })

  it('no muestra la sección de timeline cuando está vacía', async () => {
    server.use(http.get(API, () => HttpResponse.json(CALM_RESPONSE)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText(/Nada urgente ahora/)).toBeTruthy(),
    )
    expect(screen.queryByText('Hoy', { selector: 'h2' })).toBeNull()
  })

  it('muestra estado de carga mientras se obtienen los datos', async () => {
    server.use(
      http.get(API, async () => {
        await new Promise((r) => setTimeout(r, 500))
        return HttpResponse.json(CALM_RESPONSE)
      }),
    )

    render(<HoyPage />, { wrapper: makeWrapper() })

    expect(screen.getByText('Cargando…')).toBeTruthy()
  })

  it('muestra error si la petición falla', async () => {
    server.use(http.get(API, () => new HttpResponse(null, { status: 500 })))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText(/No se pudo cargar/)).toBeTruthy(),
    )
  })
})

/* ---------- Tarjeta Compra ---------- */

describe('HoyPage — tarjeta Compra', () => {
  it('muestra "X por comprar" cuando hay Ítems pendientes', async () => {
    const response: TodayOut = {
      hero: null,
      timeline: [],
      summary: {
        shopping_pending_count: 5,
        pautas_active_count: 0,
        pautas_finished_count: 0,
        next_medical_event: null,
        children_status: 'up_to_date',
      },
    }
    server.use(http.get(API, () => HttpResponse.json(response)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText('5 por comprar')).toBeTruthy(),
    )
  })

  it('muestra "Lista vacía" cuando shopping_pending_count es 0', async () => {
    server.use(http.get(API, () => HttpResponse.json(CALM_RESPONSE)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText('Lista vacía')).toBeTruthy(),
    )
  })

  it('la tarjeta Compra navega a /compra', async () => {
    server.use(http.get(API, () => HttpResponse.json(CALM_RESPONSE)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText('Compra')).toBeTruthy(),
    )
    const link = screen.getByText('Compra').closest('a')
    expect(link?.getAttribute('href')).toBe('/compra')
  })
})
