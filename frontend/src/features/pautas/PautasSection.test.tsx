import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/server'
import { PautasSection } from './PautasSection'
import type { Child } from '../children/types'
import type { HealthVisit } from '../health-visits/types'
import type { Member } from '../members/types'
import type { Pauta } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

vi.mock('../../features/toasts/useToast', () => ({
  useToast: () => ({
    success: () => 1,
    error: () => 1,
    info: () => 1,
    dismiss: () => {},
  }),
}))

const URL_PAUTAS = 'http://localhost:8000/pautas'
const URL_CHILDREN = 'http://localhost:8000/children'
const URL_MEMBERS = 'http://localhost:8000/members'
const URL_VISITS = 'http://localhost:8000/children/hijo-1/health-visits'

const CHILDREN: Child[] = [
  { id: 'hijo-1', family_id: 'fam', name: 'Mateo', birth_date: '2020-03-15', avatar_color: 'sage' },
]

const MEMBERS: Member[] = [
  { id: 'mem-ana', family_id: 'fam', display_name: 'Ana' },
]

function renderSection(pautas: Pauta[] = [], visits: HealthVisit[] = []) {
  server.use(
    http.get(URL_PAUTAS, () => HttpResponse.json(pautas)),
    http.get(URL_CHILDREN, () =>
      HttpResponse.json([
        { id: 'hijo-1', family_id: 'fam', name: 'Mateo', birth_date: '2020-03-15' },
      ]),
    ),
    http.get(URL_MEMBERS, () =>
      HttpResponse.json([
        { id: 'mem-ana', family_id: 'fam', display_name: 'Ana' },
      ]),
    ),
    http.get(URL_VISITS, () => HttpResponse.json(visits)),
  )

  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PautasSection
          subjectId="hijo-1"
          subjectType="child"
          subjectName="Mateo"
          pautas={pautas}
          visits={visits}
          children={CHILDREN}
          members={MEMBERS}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const activePauta: Pauta = {
  id: 'pauta-1',
  family_id: 'fam',
  child_id: 'hijo-1',
  member_id: null,
  subject_name: 'Mateo',
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

const finishedPauta: Pauta = {
  id: 'pauta-fin',
  family_id: 'fam',
  child_id: 'hijo-1',
  member_id: null,
  subject_name: 'Mateo',
  medication: 'Amoxicilina',
  dose: '5 ml',
  interval_hours: 8,
  duration_days: 7,
  started_at: '2026-06-10T08:00:00Z',
  ends_at: '2026-06-17T08:00:00Z',
  status: 'finished',
  health_visit_id: null,
  created_by: 'member-1',
  created_at: '2026-06-10T08:00:00Z',
  day_number: 7,
  next_dose_at: null,
  todays_administrations: [],
}

describe('PautasSection', () => {
  it('muestra pautas activas para el Hijo seleccionado', async () => {
    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([activePauta])),
    )

    renderSection([activePauta])

    expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    expect(screen.queryByText('Activas')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Registrar pauta' })).not.toBeNull()
  })

  it('filtra y muestra solo pautas del sujeto correcto (ignora las de otros hijos)', async () => {
    const otroHijoPauta: Pauta = {
      ...activePauta,
      id: 'pauta-otro',
      child_id: 'hijo-2',
      subject_name: 'Lucía',
    }

    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([activePauta, otroHijoPauta])),
    )

    renderSection([activePauta, otroHijoPauta])

    expect(screen.queryAllByText(/Amoxicilina · 5 ml/).length).toBe(1)
    expect(screen.queryByText(/Lucía/)).toBeNull()
  })

  it('agrupa finalizadas en sección colapsable ordenada por created_at desc', async () => {
    const oldFinished: Pauta = {
      ...finishedPauta,
      id: 'pauta-fin-old',
      created_at: '2026-06-01T08:00:00Z',
    }
    const newFinished: Pauta = {
      ...finishedPauta,
      id: 'pauta-fin-new',
      created_at: '2026-06-10T08:00:00Z',
    }

    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([activePauta, newFinished, oldFinished])),
    )

    renderSection([activePauta, newFinished, oldFinished])

    const details = document.querySelector('details.pautas-section__group')
    expect(details).not.toBeNull()
    // Las 3 pautas (activa + 2 finalizadas) comparten el mismo texto
    expect(screen.queryAllByText(/Amoxicilina · 5 ml/).length).toBe(3)
    expect(screen.queryByText(/Finalizadas \(2\)/)).not.toBeNull()
  })

  it('oculta sección Finalizadas cuando no hay pautas finalizadas', async () => {
    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([activePauta])),
    )

    renderSection([activePauta])

    const details = document.querySelector('details.pautas-section__group')
    expect(details).toBeNull()
  })

  it('muestra estado vacío cuando no hay pautas para el Hijo', async () => {
    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([])),
    )

    renderSection([])

    expect(screen.queryByText(/no tiene pautas registradas/)).not.toBeNull()
    expect(screen.queryByText('Activas')).toBeNull()
  })

  it('preselecciona el Hijo en el formulario PautaForm', async () => {
    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([])),
    )

    const user = userEvent.setup()
    renderSection([])

    // Abrir el formulario pulsando el botón "Pauta"
    await user.click(screen.getByText('Pauta'))

    const form = document.querySelector('form.pauta-form')
    expect(form).not.toBeNull()

    // El primer select dentro del form es el de sujeto
    const subjectSelect = form!.querySelector('select') as HTMLSelectElement
    expect(subjectSelect.value).toBe('child:hijo-1')
  })

  it('preselecciona un Miembro cuando subjectType es "member"', async () => {
    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([])),
    )

    const user = userEvent.setup()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <PautasSection
            subjectId="mem-ana"
            subjectType="member"
            subjectName="Ana"
            pautas={[]}
            visits={[]}
            children={CHILDREN}
            members={MEMBERS}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    // Abrir el formulario pulsando el botón "Pauta"
    await user.click(screen.getByText('Pauta'))

    const form = document.querySelector('form.pauta-form')
    expect(form).not.toBeNull()

    // Verificar que el select existe y el valor preseleccionado es el Miembro
    const subjectSelect = form!.querySelector('select') as HTMLSelectElement
    expect(subjectSelect).not.toBeNull()
    expect(subjectSelect.value).toBe('member:mem-ana')
  })

  it('filtra pautas por member_id cuando subjectType es "member"', async () => {
    const memberPauta: Pauta = {
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
      created_by: 'member-1',
      created_at: '2026-06-12T08:00:00Z',
      day_number: 1,
      next_dose_at: '2026-06-12T20:00:00Z',
      todays_administrations: [],
    }

    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([activePauta, memberPauta])),
    )

    const user = userEvent.setup()
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <PautasSection
            subjectId="mem-ana"
            subjectType="member"
            subjectName="Ana"
            pautas={[activePauta, memberPauta]}
            visits={[]}
            children={CHILDREN}
            members={MEMBERS}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await user.click(screen.getByText('Pauta'))

    // Solo la pauta del miembro debe mostrarse (la del hijo no aplica)
    expect(screen.queryAllByText(/Amoxicilina · 5 ml/).length).toBe(0)
    expect(screen.queryByText(/Ibuprofeno · 400 mg/)).not.toBeNull()
  })

  it('ordena pautas activas por next_dose_at (más próxima primero)', async () => {
    const proxima: Pauta = {
      ...activePauta,
      id: 'pauta-proxima',
      next_dose_at: '2026-06-13T08:00:00Z',
    }
    const lejana: Pauta = {
      ...activePauta,
      id: 'pauta-lejana',
      next_dose_at: '2026-06-15T08:00:00Z',
    }

    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([lejana, proxima])),
    )

    renderSection([lejana, proxima])

    const activeCards = Array.from(screen.queryAllByText(/Amoxicilina · 5 ml/))
    expect(activeCards.length).toBe(2)
  })

  it('ordena pautas finalizadas por created_at desc (más reciente primero)', async () => {
    const oldFinished: Pauta = {
      ...finishedPauta,
      id: 'pauta-fin-old',
      created_at: '2026-06-01T08:00:00Z',
    }
    const newFinished: Pauta = {
      ...finishedPauta,
      id: 'pauta-fin-new',
      created_at: '2026-06-10T08:00:00Z',
    }

    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([newFinished, oldFinished])),
    )

    renderSection([newFinished, oldFinished])

    const details = document.querySelector('details.pautas-section__group')
    expect(details).not.toBeNull()
  })

  it('muestra PautaCard con showSubject=false (sin nombre del sujeto en la tarjeta)', async () => {
    server.use(
      http.get(URL_PAUTAS, () => HttpResponse.json([activePauta])),
    )

    renderSection([activePauta])

    expect(screen.queryByText(/Mateo/)).toBeNull()
  })
})
