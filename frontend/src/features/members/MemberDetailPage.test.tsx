import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ToastProvider } from '../toasts/toasts'
import { MemberDetailPage } from './MemberDetailPage'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const MEMBER = { id: 'mem-ana', family_id: 'fam', display_name: 'Ana' }

const PAUTA_MEMBER_ACTIVE = {
  id: 'pauta-mem',
  family_id: 'fam',
  child_id: null,
  member_id: 'mem-ana',
  subject_name: 'Ana',
  medication: 'Ibuprofeno',
  dose: '400 mg',
  interval_hours: 12,
  duration_days: 5,
  started_at: '2026-06-12T08:00:00Z',
  ends_at: '2026-06-17T08:00:00Z',
  status: 'active',
  health_visit_id: null,
  created_by: 'mem-ana',
  created_at: '2026-06-12T08:00:00Z',
  day_number: 1,
  next_dose_at: '2026-06-12T20:00:00Z',
  todays_administrations: [],
}

const PAUTA_MEMBER_FINISHED = {
  ...PAUTA_MEMBER_ACTIVE,
  id: 'pauta-mem-fin',
  medication: 'Paracetamol',
  status: 'finished',
  next_dose_at: null,
}

// Pauta de otro sujeto — no debe aparecer en el detalle del Miembro.
const PAUTA_CHILD = {
  ...PAUTA_MEMBER_ACTIVE,
  id: 'pauta-child',
  child_id: 'c1',
  member_id: null,
  subject_name: 'Leo',
  medication: 'Amoxicilina',
}

let queryClient: QueryClient

beforeEach(() => {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
})

function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/miembros/mem-ana']}>
          <Routes>
            <Route path="/miembros/:memberId" element={children} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

function stubData(pautas: unknown[] = [PAUTA_MEMBER_ACTIVE, PAUTA_MEMBER_FINISHED]) {
  const base = 'http://localhost:8000'
  return [
    http.get(`${base}/members`, () => HttpResponse.json([MEMBER])),
    http.get(`${base}/children`, () => HttpResponse.json([])),
    http.get(`${base}/pautas`, () => HttpResponse.json(pautas)),
  ]
}

describe('MemberDetailPage', () => {
  it('muestra el header con el nombre del Miembro y botón back a /familia', async () => {
    server.use(...stubData([]))
    render(<MemberDetailPage />, { wrapper: makeWrapper() })

    expect(await screen.findByText('Ana')).toBeTruthy()
    expect(document.querySelector('a[href="/familia"]')).toBeTruthy()
  })

  it('el tab por defecto es Pautas y muestra las activas del Miembro', async () => {
    server.use(...stubData())
    render(<MemberDetailPage />, { wrapper: makeWrapper() })

    // Tab Pautas activa por defecto
    expect(await screen.findByRole('tab', { name: 'Pautas' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByText(/Ibuprofeno · 400 mg/)).toBeTruthy()
  })

  it('filtra solo las Pautas del Miembro (ignora las de Hijos)', async () => {
    server.use(...stubData([PAUTA_MEMBER_ACTIVE, PAUTA_CHILD]))
    render(<MemberDetailPage />, { wrapper: makeWrapper() })

    expect(await screen.findByText(/Ibuprofeno · 400 mg/)).toBeTruthy()
    expect(screen.queryByText(/Amoxicilina/)).toBeNull()
  })

  it('muestra las Pautas finalizadas en sección colapsable', async () => {
    server.use(...stubData())
    render(<MemberDetailPage />, { wrapper: makeWrapper() })

    expect(await screen.findByText(/Finalizadas \(1\)/)).toBeTruthy()
  })

  it('el tab Visitas muestra un empty state placeholder', async () => {
    server.use(...stubData())
    render(<MemberDetailPage />, { wrapper: makeWrapper() })

    fireEvent.click(await screen.findByRole('tab', { name: 'Visitas' }))
    expect(screen.getByRole('tab', { name: 'Visitas' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText(/Sin visitas médicas/i)).toBeTruthy()
  })
})
