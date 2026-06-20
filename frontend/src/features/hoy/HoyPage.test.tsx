import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ToastProvider } from '../toasts/toasts'
import { HoyPage } from './HoyPage'
import type { TodayOut } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const API = 'http://localhost:8000/api/today'
const ADMIN_POST = 'http://localhost:8000/pautas/:id/administrations'
const ADMIN_DELETE =
  'http://localhost:8000/pautas/:id/administrations/:adminId'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ToastProvider>{children}</ToastProvider>
      </MemoryRouter>
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
    children_status: 'al_dia',
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

  it('muestra estado vacío tranquilo cuando el timeline no tiene entradas', async () => {
    server.use(http.get(API, () => HttpResponse.json(CALM_RESPONSE)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByText(/Nada urgente ahora/)).toBeTruthy(),
    )
    expect(screen.getByText(/Hoy está tranquilo/)).toBeTruthy()
    expect(
      screen.getByRole('heading', { name: 'Agenda de hoy', level: 2 }),
    ).toBeTruthy()
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
        children_status: 'al_dia',
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

/* ---------- Aporte Fase 3: héroe dosis + timeline ---------- */

const HERO_PAUTA: TodayOut = {
  hero: {
    type: 'pauta_dose',
    title: 'Amoxicilina · 5 ml',
    subtitle: 'Mateo · Día 1 de 7',
    action_label: 'Marcar toma',
    pauta_id: 'pauta-1',
  },
  timeline: [],
  summary: {
    shopping_pending_count: 0,
    pautas_active_count: 1,
    pautas_finished_count: 0,
    next_medical_event: null,
    children_status: 'al_dia',
  },
}

describe('HoyPage — héroe dosis (Marcar toma + Deshacer)', () => {
  it('muestra el título, subtítulo y acción del héroe de toma', async () => {
    server.use(http.get(API, () => HttpResponse.json(HERO_PAUTA)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() => expect(screen.getByText('Amoxicilina · 5 ml')).toBeTruthy())
    expect(screen.getByText('Mateo · Día 1 de 7')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marcar toma' })).toBeTruthy()
  })

  it('al pulsar "Marcar toma" registra la Administración y ofrece "Deshacer"', async () => {
    const markSpy = vi.fn()
    const undoSpy = vi.fn()
    server.use(
      http.get(API, () => HttpResponse.json(HERO_PAUTA)),
      http.post(ADMIN_POST, () => {
        markSpy()
        return HttpResponse.json({ id: 'admin-1' }, { status: 201 })
      }),
      http.delete(ADMIN_DELETE, () => {
        undoSpy()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Marcar toma' })).toBeTruthy(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Marcar toma' }))

    await waitFor(() => expect(markSpy).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(undoSpy).toHaveBeenCalledTimes(1))
  })
})

describe('HoyPage — timeline de tomas', () => {
  it('rendera las entradas del timeline (dada y próxima) con su hora', async () => {
    const response: TodayOut = {
      hero: null,
      timeline: [
        {
          type: 'dose_given',
          time: '08:30',
          title: 'Amoxicilina · 5 ml',
          subtitle: 'Dada por Ana',
          status: 'done',
          pauta_id: 'p1',
          administration_id: 'a1',
        },
        {
          type: 'dose_upcoming',
          time: '16:30',
          title: 'Amoxicilina · 5 ml',
          subtitle: 'Mateo',
          status: 'upcoming',
          pauta_id: 'p1',
        },
      ],
      summary: {
        shopping_pending_count: 0,
        pautas_active_count: 1,
        pautas_finished_count: 0,
        next_medical_event: null,
        children_status: 'al_dia',
      },
    }
    server.use(http.get(API, () => HttpResponse.json(response)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() => expect(screen.getByText('08:30')).toBeTruthy())
    expect(screen.getByText('16:30')).toBeTruthy()
    expect(screen.getAllByText('Amoxicilina · 5 ml')).toHaveLength(2)
  })
})

/* ---------- Aporte Fase 4: héroe evento + próxima cita ---------- */

const EVENT_DONE = 'http://localhost:8000/events/:id/done'
const EVENT_UNDO = 'http://localhost:8000/events/:id/undo'

const HERO_EVENT: TodayOut = {
  hero: {
    type: 'event',
    title: 'Cole',
    subtitle: '09:00 · Lucía',
    action_label: 'Marcar hecho',
    event_id: 'ev-1',
  },
  timeline: [],
  summary: {
    shopping_pending_count: 0,
    pautas_active_count: 0,
    pautas_finished_count: 0,
    next_medical_event: null,
    children_status: 'al_dia',
  },
}

describe('HoyPage — héroe evento (Marcar hecho + Deshacer)', () => {
  it('muestra el héroe de Evento y permite marcar hecho y deshacer', async () => {
    const doneSpy = vi.fn()
    const undoSpy = vi.fn()
    server.use(
      http.get(API, () => HttpResponse.json(HERO_EVENT)),
      http.post(EVENT_DONE, () => {
        doneSpy()
        return HttpResponse.json({})
      }),
      http.post(EVENT_UNDO, () => {
        undoSpy()
        return HttpResponse.json({})
      }),
    )

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() => expect(screen.getByText('Cole')).toBeTruthy())
    expect(screen.getByText('09:00 · Lucía')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Marcar hecho' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Marcar hecho' }))
    await waitFor(() => expect(doneSpy).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Deshacer' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(undoSpy).toHaveBeenCalledTimes(1))
  })
})

describe('HoyPage — tarjeta Próxima cita', () => {
  it('muestra el Evento médico próximo y enlaza a /eventos', async () => {
    const response: TodayOut = {
      hero: null,
      timeline: [],
      summary: {
        shopping_pending_count: 0,
        pautas_active_count: 0,
        pautas_finished_count: 0,
        next_medical_event: {
          id: 'ev-med',
          family_id: 'fam',
          title: 'Vacuna',
          date: '2030-07-01',
          time: '11:30:00',
          event_type_id: 't-med',
          event_type: {
            id: 't-med',
            family_id: null,
            name: 'Médico',
            icon: 'stethoscope',
            is_system: true,
          },
          child_id: null,
          child: null,
          status: 'pending',
          is_overdue: false,
          series_id: null,
          created_by: 'm1',
          created_at: '2026-06-17T10:00:00Z',
        },
        children_status: 'al_dia',
      },
    }
    server.use(http.get(API, () => HttpResponse.json(response)))

    render(<HoyPage />, { wrapper: makeWrapper() })

    await waitFor(() => expect(screen.getByText('Vacuna')).toBeTruthy())
    const link = screen.getByText('Próxima cita').closest('a')
    expect(link?.getAttribute('href')).toBe('/eventos')
  })
})
