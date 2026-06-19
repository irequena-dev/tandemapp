import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { PautasPage } from './PautasPage'
import type { Administration, Pauta } from './types'

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
  next_dose_at: '2026-06-12T16:00:00Z',
  todays_administrations: [],
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
    const finished: Pauta = { ...samplePauta, id: 'pauta-fin', status: 'finished', next_dose_at: null }
    renderPage([finished])
    await waitFor(() => {
      expect(screen.queryByText('Finalizada')).not.toBeNull()
    })
  })

  it('Pauta auto-finalizada (status=finished, next_dose_at=null) muestra recesado sin próxima toma', async () => {
    const autoFinished: Pauta = {
      ...samplePauta,
      id: 'pauta-auto-fin',
      status: 'finished',
      next_dose_at: null,
    }
    renderPage([autoFinished])
    await waitFor(() => {
      expect(screen.queryByText('Finalizada')).not.toBeNull()
    })
    // No debe mostrar "Próxima toma" en el header
    expect(screen.queryByText('Próxima toma')).toBeNull()
  })

  it('muestra tomas del día con "Dada por" y botón "Marcar toma"', async () => {
    const admin: Administration = {
      id: 'admin-1',
      pauta_id: 'pauta-1',
      administered_at: '2026-06-17T10:00:00Z',
      administered_by: 'member-1',
      member_name: 'Ana',
      created_at: '2026-06-17T10:00:00Z',
    }
    const pautaWithAdmin: Pauta = {
      ...samplePauta,
      todays_administrations: [admin],
    }

    server.use(
      http.post('http://localhost:8000/pautas/:pautaId/administrations', () =>
        HttpResponse.json(admin, { status: 201 }),
      ),
    )

    renderPage([pautaWithAdmin])

    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })

    // Expand the card
    const user = userEvent.setup()
    const header = screen.getByRole('button', { expanded: false })
    await user.click(header)

    // Should show today's tomas section
    await waitFor(() => {
      expect(screen.queryByText('Tomas de hoy')).not.toBeNull()
    })

    // Should show "Dada por Ana"
    expect(screen.queryByText(/Dada por Ana/)).not.toBeNull()

    // Should show "Marcar toma" button
    expect(screen.queryByText('Marcar toma')).not.toBeNull()

    // Should show "Deshacer" button
    expect(screen.queryByText('Deshacer')).not.toBeNull()
  })

  it('bloquea "Marcar toma" cuando hay una toma reciente (<15 min) y muestra aviso', async () => {
    const recentIso = new Date(Date.now() - 5 * 60_000).toISOString()
    const recentAdmin: Administration = {
      id: 'admin-recent',
      pauta_id: 'pauta-1',
      administered_at: recentIso,
      administered_by: 'member-1',
      member_name: 'Ana',
      created_at: recentIso,
    }
    const pautaRecent: Pauta = {
      ...samplePauta,
      todays_administrations: [recentAdmin],
    }

    renderPage([pautaRecent])
    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { expanded: false }))

    const markBtn = screen.getByText('Marcar toma').closest('button')!
    expect(markBtn.disabled).toBe(true)
    expect(screen.queryByText(/Toma reciente/)).not.toBeNull()
  })

  it('muestra siguiente toma desde next_dose_at del servidor', async () => {    renderPage([samplePauta])

    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })

    const user = userEvent.setup()
    const header = screen.getByRole('button', { expanded: false })
    await user.click(header)

    await waitFor(() => {
      expect(screen.queryByText('Siguiente toma')).not.toBeNull()
    })
    expect(screen.queryByText(/Próxima/)).not.toBeNull()
  })
})
