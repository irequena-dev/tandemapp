import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
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
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

function seed(handlers: ReturnType<typeof http.get>[] = []) {
  server.use(
    http.get(TYPES_URL, () => HttpResponse.json([type1])),
    http.get(CHILDREN_URL, () => HttpResponse.json([])),
    ...handlers,
  )
}

describe('EventosPage — Series recurrentes', () => {
  it('muestra "Borrar futuras" en un Evento de Serie y lo borra al pulsar', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /Borrar futuras/ }))

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
