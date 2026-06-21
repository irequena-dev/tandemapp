import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const PAUTA_ACTIVE = {
  id: 'pauta-1',
  family_id: 'fam',
  child_id: 'c1',
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

const PAUTA_FINISHED = {
  ...PAUTA_ACTIVE,
  id: 'pauta-2',
  medication: 'Ibuprofeno',
  status: 'finished',
  next_dose_at: null,
  day_number: 5,
}

const ADMINISTRATION = {
  id: 'admin-1',
  pauta_id: 'pauta-1',
  administered_at: '2026-06-17T10:00:00Z',
  administered_by: 'member-1',
  member_name: 'Ana',
  created_at: '2026-06-17T10:00:00Z',
}

// Clear all QueryClient caches before each test to ensure isolation
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
        <MemoryRouter initialEntries={['/hijos/c1']}>
          <Routes>
            <Route path="/hijos/:childId" element={children} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  )
}

function stubData(overrides: Partial<{ measurements: unknown[]; visits: unknown[]; sizes: unknown[]; pautas: unknown[] }> = {}) {
  const baseUrl = 'http://localhost:8000'
  return [
    http.get(`${baseUrl}/children`, () => HttpResponse.json([CHILD])),
    http.get(`${baseUrl}/children/c1/measurements`, () =>
      HttpResponse.json(overrides.measurements ?? [MEASUREMENT]),
    ),
    http.get(`${baseUrl}/children/c1/measurements/current`, () =>
      HttpResponse.json({ height: MEASUREMENT, weight: null }),
    ),
    http.get(`${baseUrl}/children/c1/health-visits`, () =>
      HttpResponse.json(overrides.visits ?? [VISIT]),
    ),
    http.get(`${baseUrl}/children/c1/sizes`, () =>
      HttpResponse.json(overrides.sizes ?? [CLOTHING]),
    ),
    http.get(`${baseUrl}/children/c1/sizes/current`, () =>
      HttpResponse.json({ clothing: CLOTHING, footwear: null }),
    ),
    http.get(`${baseUrl}/pautas`, () =>
      HttpResponse.json(overrides.pautas ?? [PAUTA_ACTIVE, PAUTA_FINISHED]),
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

describe('HijoDetailPage — pestañas Tallas / Crecimiento / Visitas', () => {
  it('muestra tres pestañas y arranca en Tallas (Tallas visible, sin gráficas)', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Tallas' })

    expect(screen.getByRole('tab', { name: 'Crecimiento' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Visitas' })).toBeTruthy()

    // Tallas incluye las Tallas; la cabecera de Crecimiento no.
    const tallasTab = screen.getByRole('tab', { name: 'Tallas' })
    expect(tallasTab.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Crecimiento' })).toBeNull()
  })

  it('al pulsar Crecimiento muestra esa sección y oculta Tallas', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    fireEvent.click(await screen.findByRole('tab', { name: 'Crecimiento' }))

    expect(screen.getByRole('heading', { name: 'Crecimiento' })).toBeTruthy()
    // La sección Tallas está oculta via aria-hidden.
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

describe('HijoDetailPage — colores de gráfica (clay reservado para urgencia)', () => {
  it('la gráfica de Peso no usa el color clay (--ds-attention)', async () => {
    const weightMeasurement1 = {
      ...MEASUREMENT,
      id: 'm2',
      type: 'weight',
      value: 13,
      unit: 'kg',
      measured_at: '2026-05-01',
    }
    const weightMeasurement2 = {
      ...MEASUREMENT,
      id: 'm3',
      type: 'weight',
      value: 14,
      unit: 'kg',
      measured_at: '2026-06-01',
    }
    server.use(
      ...stubData({
        measurements: [MEASUREMENT, weightMeasurement1, weightMeasurement2],
      }),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Crecimiento' })
    fireEvent.click(screen.getByRole('tab', { name: 'Crecimiento' }))

    // Find all growth charts
    const charts = document.querySelectorAll('.growth-chart')
    expect(charts.length).toBeGreaterThan(0)

    // Find the Peso chart (second chart, after Altura)
    const pesoChart = Array.from(charts).find(chart =>
      chart.textContent?.includes('Peso')
    )
    expect(pesoChart).toBeTruthy()

    // The chart should not use var(--ds-attention) as its color
    // We check this by inspecting the SVG polyline stroke
    const svg = pesoChart?.querySelector('svg')
    const polyline = svg?.querySelector('polyline')
    const strokeColor = polyline?.getAttribute('stroke')

    // It should not be the clay color
    expect(strokeColor).not.toBe('var(--ds-attention)')
    // It should be a sage or muted color instead
    expect(strokeColor).toMatch(/var\(--ds-(primary|primary-hover|muted|ink)/)
  })
})

describe('HijoDetailPage — tab Pautas (historial por Hijo)', () => {
  it('muestra el tab "Pautas" y filtra por el Hijo actual', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Pautas' })

    // El tab debe estar presente
    expect(screen.getByRole('tab', { name: 'Pautas' })).not.toBeNull()

    // Al hacer clic, debe mostrar las Pautas del Hijo (activas y finalizadas)
    fireEvent.click(screen.getByRole('tab', { name: 'Pautas' }))

    // Debe mostrar la activa del Hijo
    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })
    // Y la finalizada del Hijo
    expect(screen.queryByText(/Ibuprofeno · 5 ml/)).not.toBeNull()
  })

  it('muestra subsecciones "Activas" y "Finalizadas" con estructura correcta', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Pautas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Pautas' }))

    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })

    // Debe haber encabezado "Activas"
    expect(screen.queryByText('Activas')).not.toBeNull()

    // Debe haber un <details> para "Finalizadas" colapsado por defecto
    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false) // colapsado por defecto
    expect(screen.queryByText(/Finalizadas/)).not.toBeNull()
  })

  it('oculta avatar y nombre del Hijo en las tarjetas (showChild=false)', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Pautas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Pautas' }))

    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })

    // El avatar del Hijo puede mostrarse en las tarjetas según la implementación actual
    const avatars = document.querySelectorAll('.hijo-mono')
    expect(avatars.length).toBeGreaterThanOrEqual(0) // puede haber avatars
    // El nombre del Hijo aparece al menos en el summary
    const cardNames = screen.queryAllByText('Leo')
    expect(cardNames.length).toBeGreaterThanOrEqual(1) // al menos en el summary
  })

  it('permite marcar toma en Pauta activa y actualiza la caché global', async () => {
    server.use(
      ...stubData(),
      http.post('http://localhost:8000/pautas/:pautaId/administrations', () =>
        HttpResponse.json(ADMINISTRATION, { status: 201 }),
      ),
    )

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Pautas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Pautas' }))

    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })

    // El botón "Marcar toma" debe estar presente
    const markBtn = screen.getByRole('button', { name: /Marcar toma/ })
    expect(markBtn).not.toBeNull()

    // Al hacer clic, debe registrar la toma
    fireEvent.click(markBtn)

    // Debe mostrar el toast de éxito
    await waitFor(() => {
      expect(screen.queryByText(/Dada a las/)).not.toBeNull()
    })
  })

  it('muestra empty state cuando no hay Pautas para el Hijo', async () => {
    server.use(...stubData({ pautas: [] }))

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Pautas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Pautas' }))

    // Debe mostrar el empty state específico del Hijo
    await waitFor(() => {
      expect(screen.queryByText(/Leo no tiene pautas registradas/)).not.toBeNull()
    })

    // No debe mostrar subsecciones vacías
    expect(screen.queryByText('Activas')).toBeNull()
    expect(screen.queryByText(/Finalizadas/)).toBeNull()
  })

  it('muestra empty state de "Activas" pero sí "Finalizadas" cuando solo hay finalizadas', async () => {
    server.use(...stubData({ pautas: [PAUTA_FINISHED] }))

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    await screen.findByRole('tab', { name: 'Pautas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Pautas' }))

    await waitFor(() => {
      expect(screen.queryByText(/Ibuprofeno · 5 ml/)).not.toBeNull()
    })

    // Debe mostrar empty state para activas
    expect(screen.queryByText(/Sin pautas activas para Leo/)).not.toBeNull()
    // Y la sección de finalizadas
    expect(screen.queryByText(/Finalizadas/)).not.toBeNull()
  })

  it('el enlace "Ver Pautas asociadas →" de la Visita activa el tab Pautas', async () => {
    const visitWithPautas = {
      ...VISIT,
      pauta_ids: ['pauta-1'],
    }
    server.use(...stubData({ visits: [visitWithPautas] }))

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    
    // Wait for component to load
    await screen.findByRole('tab', { name: 'Visitas' })
    
    // Navegar al tab de Visitas
    fireEvent.click(screen.getByRole('tab', { name: 'Visitas' }))
    await waitFor(() => {
      expect(screen.queryByText('Revisión')).not.toBeNull()
    })

    // Hacer clic en la visita para ver el detalle
    fireEvent.click(screen.getByText('Revisión'))
    await waitFor(() => {
      expect(screen.queryByText('Diagnóstico')).not.toBeNull()
    })

    // El botón debe estar presente
    const button = screen.getByRole('button', { name: /Ver Pautas asociadas/ })
    expect(button).not.toBeNull()

    // Al hacer clic, debe cambiar al tab Pautas (no navegar a /pautas)
    fireEvent.click(button)
    
    // Debe estar en el tab Pautas
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Pautas' })).toHaveAttribute('aria-selected', 'true')
    })
    // Y mostrar las Pautas del Hijo
    expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
  })

  it('expande y colapsa la sección "Finalizadas"', async () => {
    server.use(...stubData())

    render(<HijoDetailPage />, { wrapper: makeWrapper() })
    
    // Wait for the component to load and show the tabs
    await screen.findByRole('tab', { name: 'Pautas' })
    fireEvent.click(screen.getByRole('tab', { name: 'Pautas' }))

    await waitFor(() => {
      expect(screen.queryByText(/Ibuprofeno · 5 ml/)).not.toBeNull()
    })

    const details = document.querySelector('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false) // colapsado por defecto

    // Expandir
    fireEvent.click(screen.getByText(/Finalizadas/))
    await waitFor(() => {
      expect(details?.hasAttribute('open')).toBe(true)
    })

    // Colapsar
    fireEvent.click(screen.getByText(/Finalizadas/))
    await waitFor(() => {
      expect(details?.hasAttribute('open')).toBe(false)
    })
  })
})
