import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { PautasPage } from './PautasPage'
import type { Pauta } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
  Show: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const URL_PAUTAS = 'http://localhost:8000/pautas'
const URL_CHILDREN = 'http://localhost:8000/children'

function renderPage(pautas: Pauta[] = []) {
  server.use(
    http.get(URL_PAUTAS, () => HttpResponse.json(pautas)),
    http.get(URL_CHILDREN, () =>
      HttpResponse.json([
        { id: 'hijo-1', family_id: 'fam', name: 'Mateo', birth_date: '2020-03-15' },
      ]),
    ),
  )

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pautas']}>
        <Routes>
          <Route path="/pautas" element={<PautasPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const samplePauta: Pauta = {
  id: 'pauta-1',
  family_id: 'fam',
  child_id: 'hijo-1',
  medication: 'Amoxicilina',
  dose: '5 ml',
  interval_hours: 8,
  duration_days: 7,
  started_at: '2026-06-12T08:00:00Z',
  ends_at: '2026-06-19T08:00:00Z',
  status: 'active',
  health_visit_id: null,
  created_by: 'member-1',
  created_at: '2026-06-12T08:00:00Z',
  day_number: 3,
}

describe('PautasPage (costura de ruta/página)', () => {
  it('muestra el estado vacío cuando no hay Pautas', async () => {
    renderPage([])
    await waitFor(() => {
      expect(screen.queryByText('Sin pautas activas')).not.toBeNull()
    })
  })

  it('muestra la Pauta activa con nombre del Hijo y progreso', async () => {
    renderPage([samplePauta])
    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })
    // Child name resolves
    await waitFor(() => {
      expect(screen.queryByText(/Mateo/)).not.toBeNull()
    })
    // Status pill
    expect(screen.queryByText('Activa')).not.toBeNull()
  })

  it('muestra las Pautas finalizadas con estilo recesado', async () => {
    const finished: Pauta = { ...samplePauta, id: 'pauta-fin', status: 'finished' }
    renderPage([finished])
    await waitFor(() => {
      expect(screen.queryByText('Finalizada')).not.toBeNull()
    })
  })
})
