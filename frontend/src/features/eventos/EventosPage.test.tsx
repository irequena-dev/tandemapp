import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ToastProvider } from '../toasts/toasts'
import { EventosPage } from './EventosPage'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const TYPES_URL = 'http://localhost:8000/event-types'
const CHILDREN_URL = 'http://localhost:8000/children'
const EVENTS_URL = 'http://localhost:8000/events'
const SERIES_URL = 'http://localhost:8000/api/series'
const FUTURE_URL = 'http://localhost:8000/api/series/:id/future'

const type1 = {
  id: 't1',
  family_id: null,
  name: 'Cole',
  icon: 'school',
  is_system: true,
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

function seed(handlers: ReturnType<typeof http.get>[] = []) {
  server.use(
    http.get(TYPES_URL, () => HttpResponse.json([type1])),
    http.get(CHILDREN_URL, () => HttpResponse.json([])),
    ...handlers,
  )
}

function isoOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('EventosPage — Series recurrentes', () => {
  it('muestra "Borrar futuras" en un Evento de Serie y pide confirmación antes de borrar', async () => {
    let deletedId: string | null = null
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev1',
            family_id: 'f',
            title: 'Cole',
            date: '2030-06-10',
            time: null,
            event_type_id: 't1',
            event_type: type1,
            child_id: null,
            child: null,
            status: 'pending',
            is_overdue: false,
            series_id: 'ser-1',
            created_by: 'm1',
            created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
      http.delete(FUTURE_URL, ({ params }) => {
        deletedId = params['id'] as string
        return new HttpResponse(null, { status: 204 })
      }),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Borrar futuras/ })).toBeTruthy(),
    )
    // Un primer toque no destruye: abre la confirmación inline (anti-resbalón).
    fireEvent.click(screen.getByRole('button', { name: /Borrar futuras/ }))
    expect(screen.getByText('¿Borrar las futuras?')).toBeTruthy()
    expect(deletedId).toBeNull()

    // Solo tras confirmar se ejecuta el borrado bulk.
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))
    await waitFor(() => expect(deletedId).toBe('ser-1'))
  })

  it('crea una Serie desde "Crear Serie" (preview + POST /api/series)', async () => {
    const created: { body?: { title?: string } } = {}
    seed([
      http.get(EVENTS_URL, () => HttpResponse.json([])),
      http.post(SERIES_URL, async ({ request }) => {
        created.body = (await request.json()) as { title?: string }
        return HttpResponse.json({ id: 'ser-1', events_created: 3 }, { status: 201 })
      }),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Eventos' })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Crear Serie' }))

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Crear serie' })).toBeTruthy(),
    )
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cole' } })
    fireEvent.change(screen.getByLabelText('Comienza el'), {
      target: { value: '2030-01-07' },
    })
    fireEvent.change(screen.getByLabelText('Nº de ocurrencias'), {
      target: { value: '3' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear serie' }))

    await waitFor(() => expect(created.body).toBeDefined())
    expect(created.body?.title).toBe('Cole')
  })
})

describe('EventosPage — agrupación temporal', () => {
  it('reparte los eventos en Atrasados / Hoy / Próximos según la fecha', async () => {
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev-past',
            family_id: 'f', title: 'Cita pasada', date: isoOffset(-3), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: true, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
          {
            id: 'ev-today',
            family_id: 'f', title: 'Cole hoy', date: isoOffset(0), time: '09:00',
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
          {
            id: 'ev-future',
            family_id: 'f', title: 'Vacaciones', date: isoOffset(10), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })

    await waitFor(() => expect(screen.getByText('Cita pasada')).toBeTruthy())

    // Cada urgencia tiene su propio encabezado de sección.
    expect(screen.getByRole('heading', { name: /Atrasados/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /^Hoy/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: /Próximos/ })).toBeTruthy()

    // La fecha de hoy muestra la etiqueta relativa "Hoy" como chip relativo.
    expect(screen.getAllByText('Hoy').length).toBeGreaterThan(0)
  })

  it('retira los hechos a una sección "Hechos" colapsable, fuera de la vista principal', async () => {
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev-done',
            family_id: 'f', title: 'Ya hecho', date: isoOffset(0), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'done', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })

    // El hecho no aparece en la vista principal (está colapsado).
    await waitFor(() => expect(screen.getByText('Hechos')).toBeTruthy())
    expect(screen.queryByText('Ya hecho')).toBeNull()

    // Al desplegar, aparece.
    fireEvent.click(screen.getByRole('button', { name: /Hechos/ }))
    await waitFor(() => expect(screen.getByText('Ya hecho')).toBeTruthy())
  })
})

describe('EventosPage — borrado con deshacer', () => {
  it('borra un Evento y lo muestra en "Reciente borrado" con botón deshacer', async () => {
    const deletedIds: string[] = []
    const created: { title?: string }[] = []
    let shouldReturnEmpty = false
    seed([
      http.get(EVENTS_URL, () => {
        if (shouldReturnEmpty) {
          return HttpResponse.json([])
        }
        return HttpResponse.json([
          {
            id: 'ev-del',
            family_id: 'f', title: 'Trámite', date: isoOffset(1), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ])
      }),
      http.delete('http://localhost:8000/events/ev-del', () => {
        deletedIds.push('ev-del')
        shouldReturnEmpty = true
        return new HttpResponse(null, { status: 204 })
      }),
      http.post(EVENTS_URL, async ({ request }) => {
        created.push((await request.json()) as { title?: string })
        return HttpResponse.json(
          { id: 'ev-restored', family_id: 'f', title: 'Trámite', date: isoOffset(1), time: null, event_type_id: 't1', event_type: type1, child_id: null, child: null, status: 'pending', is_overdue: false, series_id: null, created_by: 'm1', created_at: '2026-06-17T10:00:00Z' },
          { status: 201 },
        )
      }),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByText('Trámite')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Borrar Trámite/ }))
    await waitFor(() => expect(deletedIds).toContain('ev-del'))

    // Aparece en la sección "Reciente borrado"
    await waitFor(() => expect(screen.getByText('Reciente borrado')).toBeTruthy())
    expect(screen.getByText('Trámite', { selector: '.evento-item__title' })).toBeTruthy()

    // Tiene un botón de deshacer
    const undo = screen.getByRole('button', { name: /Deshacer Trámite/ })
    fireEvent.click(undo)

    await waitFor(() => expect(created.length).toBe(1))
    expect(created[0].title).toBe('Trámite')
  })
})

describe('EventosPage — borrado persistente (reciente borrado)', () => {
  it('permite limpiar manualmente la sección "Reciente borrado"', async () => {
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev-del',
            family_id: 'f', title: 'Trámite', date: isoOffset(1), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
      http.delete('http://localhost:8000/events/ev-del', () => {
        return new HttpResponse(null, { status: 204 })
      }),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByText('Trámite')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Borrar Trámite/ }))
    await waitFor(() => expect(screen.getByText('Reciente borrado')).toBeTruthy())

    // Hay un botón para limpiar la sección
    const clearButton = screen.getByRole('button', { name: /Limpiar/ })
    expect(clearButton).toBeTruthy()

    // Al hacer clic, la sección desaparece
    fireEvent.click(clearButton)
    await waitFor(() => expect(screen.queryByText('Reciente borrado')).toBeNull())
  })
})

describe('EventosPage — atajos de teclado', () => {
  it('abre el diálogo de crear con la tecla "n"', async () => {
    seed([
      http.get(EVENTS_URL, () => HttpResponse.json([])),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Eventos' })).toBeTruthy())

    // Press 'n' to open create dialog
    fireEvent.keyDown(window, { key: 'n' })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear' })).toBeTruthy())
  })

  it('navega entre eventos con "j" y "k"', async () => {
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev1',
            family_id: 'f', title: 'Evento 1', date: isoOffset(1), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
          {
            id: 'ev2',
            family_id: 'f', title: 'Evento 2', date: isoOffset(2), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByText('Evento 1')).toBeTruthy())

    // Press 'j' to select first event (when nothing is selected)
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      const selected = document.querySelector('.evento-item--selected')
      expect(selected).toBeTruthy()
      expect(selected?.textContent).toContain('Evento 1')
    })

    // Press 'j' again to select next event
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => {
      const selected = document.querySelector('.evento-item--selected')
      expect(selected).toBeTruthy()
      expect(selected?.textContent).toContain('Evento 2')
    })

    // Press 'k' to select previous event
    fireEvent.keyDown(window, { key: 'k' })
    await waitFor(() => {
      const selected = document.querySelector('.evento-item--selected')
      expect(selected).toBeTruthy()
      expect(selected?.textContent).toContain('Evento 1')
    })
  })

  it('marca como hecho el evento seleccionado con "x"', async () => {
    let doneId: string | null = null
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev1',
            family_id: 'f', title: 'Evento 1', date: isoOffset(1), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
      http.post('http://localhost:8000/events/ev1/done', () => {
        doneId = 'ev1'
        return new HttpResponse(null, { status: 204 })
      }),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByText('Evento 1')).toBeTruthy())

    // Select the event with 'j'
    fireEvent.keyDown(window, { key: 'j' })
    await waitFor(() => expect(document.querySelector('.evento-item--selected')).toBeTruthy())

    // Press 'x' to mark as done
    fireEvent.keyDown(window, { key: 'x' })
    await waitFor(() => expect(doneId).toBe('ev1'))
  })

  it('muestra el modal de ayuda con "?"', async () => {
    seed([
      http.get(EVENTS_URL, () => HttpResponse.json([])),
    ])

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Eventos' })).toBeTruthy())

    // Press '?' to show help
    fireEvent.keyDown(window, { key: '?' })
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Atajos de teclado' })).toBeTruthy())

    // Press 'Escape' to close
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Atajos de teclado' })).toBeNull())
  })
})

describe('EventosPage — filtros', () => {
  const type2 = {
    id: 't2',
    family_id: null,
    name: 'Médico',
    icon: 'stethoscope',
    is_system: false,
  }

  const child1 = {
    id: 'c1',
    family_id: 'f',
    name: 'Lía',
    birth_date: '2020-01-01',
    created_at: '2026-06-17T10:00:00Z',
  }

  it('muestra los filtros en un sheet, filtra por tipo y permite limpiar', async () => {
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev-cole',
            family_id: 'f', title: 'Cole', date: isoOffset(1), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
          {
            id: 'ev-med',
            family_id: 'f', title: 'Cita médica', date: isoOffset(2), time: null,
            event_type_id: 't2', event_type: type2, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
    ])
    server.use(http.get(TYPES_URL, () => HttpResponse.json([type1, type2])))
    server.use(http.get(CHILDREN_URL, () => HttpResponse.json([])))

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() =>
      expect(screen.getByText('Cole', { selector: '.evento-item__title' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Médico' }))
    await waitFor(() => {
      expect(screen.queryByText('Cole', { selector: '.evento-item__title' })).toBeNull()
      expect(screen.getByText('Cita médica', { selector: '.evento-item__title' })).toBeTruthy()
    })

    const badge = screen.getByRole('button', { name: /Filtros/ }).querySelector('.eventos__filter-badge')
    expect(badge?.textContent).toBe('1')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar filtros' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Filtros' })).toBeNull(),
    )

    expect(screen.getByRole('button', { name: /Quitar filtro Médico/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
    await waitFor(() =>
      expect(screen.getByText('Cole', { selector: '.evento-item__title' })).toBeTruthy(),
    )
    expect(screen.queryByRole('button', { name: /Quitar filtro/ })).toBeNull()
  })

  it('combina filtros de tipo e Hijo con lógica AND', async () => {
    seed([
      http.get(EVENTS_URL, () =>
        HttpResponse.json([
          {
            id: 'ev-cole-lia',
            family_id: 'f', title: 'Cole Lía', date: isoOffset(1), time: null,
            event_type_id: 't1', event_type: type1, child_id: 'c1', child: child1,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
          {
            id: 'ev-cole-solo',
            family_id: 'f', title: 'Cole solo', date: isoOffset(1), time: null,
            event_type_id: 't1', event_type: type1, child_id: null, child: null,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
          {
            id: 'ev-med-lia',
            family_id: 'f', title: 'Médico Lía', date: isoOffset(2), time: null,
            event_type_id: 't2', event_type: type2, child_id: 'c1', child: child1,
            status: 'pending', is_overdue: false, series_id: null,
            created_by: 'm1', created_at: '2026-06-17T10:00:00Z',
          },
        ]),
      ),
    ])
    server.use(http.get(TYPES_URL, () => HttpResponse.json([type1, type2])))
    server.use(http.get(CHILDREN_URL, () => HttpResponse.json([child1])))

    render(<EventosPage />, { wrapper: makeWrapper() })
    await waitFor(() => expect(screen.getByText('Cole Lía')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /Filtros/ }))
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Filtros' })).toBeTruthy(),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Médico' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lía' }))

    await waitFor(() => {
      expect(screen.getByText('Médico Lía')).toBeTruthy()
      expect(screen.queryByText('Cole Lía')).toBeNull()
      expect(screen.queryByText('Cole solo')).toBeNull()
    })

    const badge = screen.getByRole('button', { name: /Filtros/ }).querySelector('.eventos__filter-badge')
    expect(badge?.textContent).toBe('2')
  })
})
