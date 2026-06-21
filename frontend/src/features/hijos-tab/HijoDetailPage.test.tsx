import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ToastProvider } from '../toasts/toasts'
import { HijoDetailPage } from './HijoDetailPage'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const CHILD = {
  id: 'c1',
  family_id: 'fam',
  name: 'Leo',
  birth_date: '2022-03-15',
  avatar_color: 'sage',
  current_height_cm: 95,
  current_weight_kg: 14,
  current_talla: '3-4 años',
  current_talla_calzado: '26',
}

const MEASUREMENT = {
  id: 'm1',
  child_id: 'c1',
  type: 'height',
  value: 95,
  unit: 'cm',
  measured_at: '2026-06-01',
  recorded_by: 'user-1',
  created_at: '2026-06-01T10:00:00Z',
}

const VISIT = {
  id: 'v1',
  child_id: 'c1',
  family_id: 'fam',
  visited_at: '2026-06-01',
  diagnosis: 'Revisión',
  notes: null,
  pauta_ids: [],
  created_by: 'user-1',
  created_at: '2026-06-01T10:00:00Z',
}

const CLOTHING = {
  id: 'sz-c1',
  child_id: 'c1',
  type: 'clothing',
  label: '3-4 años',
  recorded_at: '2026-06-01',
  recorded_by: 'user-1',
  created_at: '2026-06-01T10:00:00Z',
}

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/hijos/c1']}>
          <Routes>
            <Route path="/hijos/:childId" element={children} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

function stubData(overrides: Partial<{ measurements: unknown[]; visits: unknown[]; sizes: unknown[] }> = {}) {
  return [
    http.get('http://localhost:8000/children', () => HttpResponse.json([CHILD])),
    http.get('http://localhost:8000/children/c1/measurements', () =>
      HttpResponse.json(overrides.measurements ?? [MEASUREMENT]),
    ),
    http.get('http://localhost:8000/children/c1/measurements/current', () =>
      HttpResponse.json({ height: MEASUREMENT, weight: null }),
    ),
    http.get('http://localhost:8000/children/c1/health-visits', () =>
      HttpResponse.json(overrides.visits ?? [VISIT]),
    ),
    http.get('http://localhost:8000/children/c1/sizes', () =>
      HttpResponse.json(overrides.sizes ?? [CLOTHING]),
    ),
    http.get('http://localhost:8000/children/c1/sizes/current', () =>
      HttpResponse.json({ clothing: CLOTHING, footwear: null }),
    ),
  ]
}

describe('HijoDetailPage — borrados destructivos (confirmación + deshacer)', () => {
  it('pide confirmación inline antes de borrar una medida y muestra toast de éxito', async () => {
    const deletes: string[] = []
    server.use(
      ...stubData(),
      http.delete('http://localhost:8000/children/c1/measurements/:id', ({ params }) => {
        deletes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    // La ficha se organiza en pestañas; Crecimiento no es la vista por defecto.
    await screen.findByRole('tab', { name: 'Crecimiento' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crecimiento' }))

    // El botón de borrar existe pero no dispara el borrado directamente.
    fireEvent.click(screen.getByRole('button', { name: 'Borrar medida' }))
    expect(deletes).toHaveLength(0)

    // Aparece la confirmación inline.
    const confirm = await screen.findByRole('group', { name: /Borrar medida/ })
    expect(confirm).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    // Ahora sí se borra.
    await waitFor(() => expect(deletes).toEqual(['m1']))
    // Y se ofrece un toast de éxito.
    await screen.findByText(/Medida borrada/i)
  })

  it('cancelar la confirmación no borra la medida', async () => {
    const deletes: string[] = []
    server.use(
      ...stubData(),
      http.delete('http://localhost:8000/children/c1/measurements/:id', ({ params }) => {
        deletes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Crecimiento' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crecimiento' }))

    fireEvent.click(screen.getByRole('button', { name: 'Borrar medida' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(deletes).toHaveLength(0)
  })

  it('ofrece "Deshacer" que re-crea la medida borrada', async () => {
    const created: Record<string, unknown>[] = []
    server.use(
      ...stubData(),
      http.delete('http://localhost:8000/children/c1/measurements/:id', () =>
        new HttpResponse(null, { status: 204 }),
      ),
      http.post('http://localhost:8000/children/c1/measurements', async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>
        created.push(body)
        return HttpResponse.json({ ...MEASUREMENT, ...body, id: 'm-restored' }, { status: 201 })
      }),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Crecimiento' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crecimiento' }))

    fireEvent.click(screen.getByRole('button', { name: 'Borrar medida' }))
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))

    const undo = await screen.findByRole('button', { name: 'Deshacer' })
    fireEvent.click(undo)

    await waitFor(() => expect(created.length).toBe(1))
    expect(created[0]).toMatchObject({ type: 'height', value: 95, unit: 'cm', measured_at: '2026-06-01' })
  })

  it('pide confirmación antes de borrar una visita y muestra toast de éxito', async () => {
    const deletes: string[] = []
    server.use(
      ...stubData(),
      http.delete('http://localhost:8000/children/c1/health-visits/:id', ({ params }) => {
        deletes.push(String(params.id))
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Visitas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Visitas' }))

    fireEvent.click(screen.getByRole('button', { name: 'Borrar visita' }))
    expect(deletes).toHaveLength(0)

    fireEvent.click(await screen.findByRole('button', { name: 'Borrar' }))
    await waitFor(() => expect(deletes).toEqual(['v1']))
    await screen.findByText(/Visita borrada/i)
  })
})

describe('HijoDetailPage — feedback de mutaciones (pending + error)', () => {
  it('al fallar el alta de una medida muestra un toast de error', async () => {
    server.use(
      ...stubData({ measurements: [] }),
      http.post('http://localhost:8000/children/c1/measurements', () =>
        HttpResponse.json({ detail: 'fail' }, { status: 500 }),
      ),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Crecimiento' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crecimiento' }))

    fireEvent.click(screen.getByRole('button', { name: 'Registrar medida' }))
    fireEvent.change(screen.getByLabelText('Valor en cm'), { target: { value: '95' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    await screen.findByText(/No se pudo registrar la medida/i)
  })

  it('al fallar el alta de una visita muestra un toast de error', async () => {
    server.use(
      ...stubData({ visits: [] }),
      http.post('http://localhost:8000/children/c1/health-visits', () =>
        HttpResponse.json({ detail: 'fail' }, { status: 500 }),
      ),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Visitas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Visitas' }))

    fireEvent.click(screen.getByRole('button', { name: 'Registrar visita' }))
    fireEvent.change(screen.getByLabelText('Diagnóstico'), { target: { value: 'Gripe' } })
    fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))

    await screen.findByText(/No se pudo registrar la visita/i)
  })
})

describe('HijoDetailPage — pestañas Resumen / Crecimiento / Visitas', () => {
  it('muestra tres pestañas y arranca en Resumen (Tallas visible, sin gráficas)', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Resumen' })

    expect(screen.getByRole('tab', { name: 'Crecimiento' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Visitas' })).toBeTruthy()

    // Resumen incluye las Tallas; la cabecera de Crecimiento no.
    const resumenTab = screen.getByRole('tab', { name: 'Resumen' })
    expect(resumenTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Crecimiento' })).toBeNull()
  })

  it('al pulsar Crecimiento muestra esa sección y oculta Tallas', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByRole('tab', { name: 'Crecimiento' }))

    expect(screen.getByRole('heading', { name: 'Crecimiento' })).toBeTruthy()
    // La sección Tallas (Resumen) está oculta via aria-hidden.
    const sizesPanel = screen.getByTestId('sizes-section').closest('[role="tabpanel"]')
    expect(sizesPanel?.getAttribute('aria-hidden')).toBe('true')
  })

  it('al pulsar Visitas muestra esa sección', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByRole('tab', { name: 'Visitas' }))

    expect(screen.getByRole('heading', { name: 'Visitas médicas' })).toBeTruthy()
  })
})

describe('HijoDetailPage — vocabulario de componentes consistente', () => {
  it('los botones de acción de fila cumplen WCAG 2.5.5 (44px mínimo)', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Crecimiento' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crecimiento' }))

    // Botones de acción en fila de medida (editar/borrar)
    const editBtn = await screen.findByRole('button', { name: 'Editar medida' })
    const deleteBtn = screen.getByRole('button', { name: 'Borrar medida' })

    // Verificar que tienen la clase correcta que define 44px
    expect(editBtn).toHaveClass('growth-row__action')
    expect(deleteBtn).toHaveClass('growth-row__action')
  })

  it('los botones de acción de visita cumplen WCAG 2.5.5 (44px mínimo)', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Visitas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Visitas' }))

    // Botones de acción en fila de visita
    const editBtn = await screen.findByRole('button', { name: 'Editar visita' })
    const deleteBtn = screen.getByRole('button', { name: 'Borrar visita' })

    expect(editBtn).toHaveClass('visita-action-btn')
    expect(deleteBtn).toHaveClass('visita-action-btn')
  })

  it('los botones de añadir usan el estilo surface-2 consistente', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Crecimiento' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crecimiento' }))

    const addBtn = screen.getByRole('button', { name: 'Registrar medida' })
    expect(addBtn).toHaveClass('hijo-detail__add-btn')
  })
})
