import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ToastProvider } from '../toasts/toasts'
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
    // retry:false para queries y mutations: los tests de error no deben reintentar.
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/pautas']}>
          <Routes>
            <Route path="/pautas" element={<PautasPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
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

  it('muestra la Pauta activa con nombre del Hijo y próxima toma en la cabecera', async () => {
    renderPage([samplePauta])
    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })
    // Child name resolves
    await waitFor(() => {
      expect(screen.queryByText(/Mateo/)).not.toBeNull()
    })
    // P0a: la tarjeta colapsada ES la respuesta — la próxima toma sube a la
    // cabecera (sin expandir), con icono (State-Is-Never-Color-Alone).
    // samplePauta.next_dose_at = 2026-06-12T16:00:00Z → 16:00 (es-ES, UTC).
    expect(screen.queryByText(/Próxima/)).not.toBeNull()
    expect(screen.queryByText(/16:00|18:00/)).not.toBeNull()
    // Y la acción de escritura primaria también vive en la tarjeta colapsada.
    expect(screen.queryByRole('button', { name: /Marcar toma/ })).not.toBeNull()
  })

  it('NO muestra Pautas finalizadas (solo activas)', async () => {
    const finished: Pauta = { ...samplePauta, id: 'pauta-fin', status: 'finished', next_dose_at: null }
    renderPage([finished])
    await waitFor(() => {
      // El estado vacío debe decir que no hay pautas activas
      expect(screen.queryByText('Sin pautas activas')).not.toBeNull()
    })
    // No debe mostrar ninguna tarjeta finalizada
    expect(screen.queryByText('Finalizada')).toBeNull()
    expect(screen.queryByText(/Amoxicilina · 5 ml/)).toBeNull()
  })

  it('muestra solo Pautas activas cuando hay mezcla de activas y finalizadas', async () => {
    const finished: Pauta = { ...samplePauta, id: 'pauta-fin', status: 'finished', next_dose_at: null }
    renderPage([samplePauta, finished])
    await waitFor(() => {
      // Solo debe aparecer la activa
      expect(screen.queryAllByText(/Amoxicilina · 5 ml/).length).toBe(1)
    })
    // No debe mostrar la sección "Finalizadas"
    expect(screen.queryByText(/Finalizadas/)).toBeNull()
    const details = document.querySelector('details.pautas__group')
    expect(details).toBeNull()
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

    // P0a/P0b: con una toma reciente, la cabecera colapsada muestra "Dada" (no
    // "Próxima") y el botón inline pasa a "Toma reciente" deshabilitado, sin
    // necesidad de expandir.
    expect(screen.queryByText(/Dada/)).not.toBeNull()
    const markBtn = screen.getByRole('button', { name: /Toma reciente.+/i })
    expect(markBtn).not.toBeNull()
    expect((markBtn as HTMLButtonElement).disabled).toBe(true)
  })

  it('muestra siguiente toma desde next_dose_at del servidor en la cabecera colapsada', async () => {
    renderPage([samplePauta])

    await waitFor(() => {
      expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull()
    })

    // P0a: la próxima toma se muestra en la cabecera colapsada SIN expandir.
    // samplePauta.next_dose_at = 2026-06-12T16:00:00Z → hora local es-ES.
    expect(screen.queryByText(/Próxima/)).not.toBeNull()

    // El cuerpo expandido conserva el detalle "Siguiente toma" como historial.
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { expanded: false }))

    await waitFor(() => {
      expect(screen.queryByText('Siguiente toma')).not.toBeNull()
    })
  })

  // --- Fase harden: confirmación inline del deshacer + toasts + error ---

  it('confirma el borrado de una toma con un paso inline (¿Borrar?) antes de eliminar', async () => {
    const admin: Administration = {
      id: 'admin-1',
      pauta_id: 'pauta-1',
      administered_at: '2026-06-17T14:32:00Z',
      administered_by: 'member-1',
      member_name: 'Ana',
      created_at: '2026-06-17T14:32:00Z',
    }
    const pautaWithAdmin: Pauta = { ...samplePauta, todays_administrations: [admin] }

    server.use(
      http.delete('http://localhost:8000/pautas/:pautaId/administrations/:adminId', () =>
        new HttpResponse(null, { status: 204 }),
      ),
    )

    renderPage([pautaWithAdmin])
    await waitFor(() => expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { expanded: false }))

    // Inicialmente hay un trigger "Deshacer" y NO aparece la pregunta de confirmación.
    const undo = await screen.findByRole('button', { name: /Deshacer toma de las/ })
    expect(screen.queryByText(/¿Borrar la toma/)).toBeNull()

    // Al tocar "Deshacer" aparece la confirmación inline (sin modal).
    await user.click(undo)
    const confirmGroup = await screen.findByRole('group', { name: /Confirmar borrado de la toma/ })
    expect(confirmGroup).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Deshacer toma de las/ })).toBeNull()

    // Cancelar oculta la confirmación y restaura el trigger.
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => {
      expect(screen.queryByRole('group', { name: /Confirmar borrado/ })).toBeNull()
    })

    // Reabrir la confirmación y esta vez confirmar → dispara DELETE + toast.
    await user.click(screen.getByRole('button', { name: /Deshacer toma de las/ }))
    await user.click(screen.getByRole('button', { name: 'Borrar' }))
    await waitFor(() => {
      expect(screen.queryByText(/Toma de las.* eliminada/)).not.toBeNull()
    })
  })

  it('finalizar Pauta pide confirmación inline y ofrece deshacer (reactivar) en el toast', async () => {
    let finishCalls = 0
    let reactivateCalls = 0
    server.use(
      http.post('http://localhost:8000/pautas/:id/finish', () => {
        finishCalls += 1
        return HttpResponse.json({ ...samplePauta, status: 'finished', next_dose_at: null })
      }),
      http.post('http://localhost:8000/pautas/:id/reactivate', () => {
        reactivateCalls += 1
        return HttpResponse.json({ ...samplePauta, status: 'active' })
      }),
    )

    renderPage([samplePauta])
    await waitFor(() => expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull())

    const user = userEvent.setup()
    // Expandir para llegar a "Finalizar Pauta".
    await user.click(screen.getByRole('button', { expanded: false }))

    // Pulsar "Finalizar Pauta" NO finaliza: abre confirmación inline.
    await user.click(await screen.findByRole('button', { name: 'Finalizar Pauta' }))
    expect(await screen.findByRole('group', { name: /Confirmar finalización/ })).not.toBeNull()
    expect(finishCalls).toBe(0)

    // Confirmar (el "Sí" tiene aria-label "Finalizar Pauta") → dispara el POST + toast con Deshacer.
    await user.click(screen.getByRole('button', { name: 'Finalizar Pauta' }))
    await waitFor(() => expect(finishCalls).toBe(1))
    const undo = await screen.findByRole('button', { name: 'Deshacer' })

    // Deshacer reactiva la Pauta.
    await user.click(undo)
    await waitFor(() => expect(reactivateCalls).toBe(1))
  })

  it('muestra un toast de éxito al marcar una toma desde la tarjeta colapsada (peak-end)', async () => {
    // El POST devuelve la Administración creada; el toast la "dice": "Dada a las … por …".
    const created: Administration = {
      id: 'admin-new',
      pauta_id: 'pauta-1',
      administered_at: '2026-06-17T09:05:00Z',
      administered_by: 'member-1',
      member_name: 'Ana',
      created_at: '2026-06-17T09:05:00Z',
    }
    server.use(
      http.post('http://localhost:8000/pautas/:pautaId/administrations', () =>
        HttpResponse.json(created, { status: 201 }),
      ),
    )

    renderPage([samplePauta])
    await waitFor(() => expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Marcar toma de/ }))

    // Peak-end: la acción se acusa, con atribución a la Miembro.
    await waitFor(() => {
      expect(screen.queryByText(/Dada a las/)).not.toBeNull()
    })
    expect(screen.queryByText(/por Ana/)).not.toBeNull()
  })

  it('muestra un error accionable cuando falla el registro de la toma', async () => {
    server.use(
      http.post('http://localhost:8000/pautas/:pautaId/administrations', () =>
        HttpResponse.json({ detail: 'boom' }, { status: 500 }),
      ),
    )

    renderPage([samplePauta])
    await waitFor(() => expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /Marcar toma de/ }))

    // El error se surface inline (role=alert), no se traga silenciosamente.
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeNull()
    })
    // Y dice algo humano, no "HTTP 500".
    expect(screen.queryByText(/servidor falló|Inténtalo de nuevo/)).not.toBeNull()
  })

  // --- Fase polish: solo activas, sin sección "Finalizadas" ---

  it('NO agrupa finalizadas: la sección "Finalizadas" no existe', async () => {
    const finished: Pauta = { ...samplePauta, id: 'pauta-fin', status: 'finished', next_dose_at: null }
    renderPage([samplePauta, finished])
    await waitFor(() => expect(screen.queryAllByText(/Amoxicilina · 5 ml/).length).toBe(1))

    // La sección "Finalizadas" NO debe existir
    const details = document.querySelector('details.pautas__group')
    expect(details).toBeNull()
    expect(screen.queryByText(/Finalizadas/)).toBeNull()
  })

  it('muestra el progreso como segmentos "Día N de M" en vez de una barra continua', async () => {
    renderPage([samplePauta])
    await waitFor(() => expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { expanded: false }))

    // La etiqueta sigue siendo "Día 3 de 7" (day_number del servidor).
    expect(screen.queryByText(/Día 3 de 7/)).not.toBeNull()
    // El indicador es discreto y accesible: role=img con la cuenta, no una
    // barra continua ni un transition de width.
    const indicator = await screen.findByRole('img', { name: /Día 3 de 7 del tratamiento/ })
    expect(indicator).not.toBeNull()
    // 7 días → 7 segmentos.
    expect(indicator.querySelectorAll('.pauta-progress__seg').length).toBe(7)
    // No debe quedar la barra continua animada.
    expect(document.querySelector('.pauta-progress__fill')).toBeNull()
    expect(document.querySelector('.pauta-progress__bar')).toBeNull()
  })

  it('muestra "Guardando…" en el botón "Marcar toma" mientras está pendiente', async () => {
    // Mock a delayed response to keep the mutation in pending state
    server.use(
      http.post('http://localhost:8000/pautas/:pautaId/administrations', async () => {
        // Intentionally delay to keep mutation in pending state
        await new Promise((resolve) => setTimeout(resolve, 10000))
        return HttpResponse.json({ id: 'admin-new' }, { status: 201 })
      }),
    )

    renderPage([samplePauta])
    await waitFor(() => expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull())

    const user = userEvent.setup()
    const markBtn = screen.getByRole('button', { name: /Marcar toma de/ })
    await user.click(markBtn)

    // P1: el botón debe mostrar "Guardando…" mientras la mutación está pendiente
    await waitFor(() => {
      expect(screen.queryByText('Guardando…')).not.toBeNull()
    })
  })

  // --- P2: No hay sección "Finalizadas" ---

  it('NO muestra sección "Finalizadas" aunque haya múltiples finalizadas', async () => {
    const finished1: Pauta = { ...samplePauta, id: 'pauta-fin-1', status: 'finished', next_dose_at: null }
    const finished2: Pauta = { ...samplePauta, id: 'pauta-fin-2', status: 'finished', next_dose_at: null }
    renderPage([samplePauta, finished1, finished2])
    await waitFor(() => expect(screen.queryAllByText(/Amoxicilina · 5 ml/).length).toBe(1))

    // No debe existir la sección "Finalizadas"
    const details = document.querySelector('details.pautas__group')
    expect(details).toBeNull()
    expect(screen.queryByText(/Finalizadas/)).toBeNull()
  })

  // --- P2: No se muestran Pautas finalizadas, por lo que no se testea su progreso ---
  // El progreso de finalizadas se testea en el tab Pautas de HijoDetail

  // --- P3: Última toma should not render when todaysAdmins is non-empty ---

  it('no muestra el hint "Última toma" cuando hay tomas de hoy (evita redundancia)', async () => {
    const recentIso = new Date(Date.now() - 5 * 60_000).toISOString()
    const recentAdmin: Administration = {
      id: 'admin-recent',
      pauta_id: 'pauta-1',
      administered_at: recentIso,
      administered_by: 'member-1',
      member_name: 'Ana',
      created_at: recentIso,
    }
    const pautaWithAdmin: Pauta = {
      ...samplePauta,
      todays_administrations: [recentAdmin],
    }

    renderPage([pautaWithAdmin])
    await waitFor(() => expect(screen.queryByText(/Amoxicilina · 5 ml/)).not.toBeNull())

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { expanded: false }))

    // Should show "Tomas de hoy" section
    await waitFor(() => {
      expect(screen.queryByText('Tomas de hoy')).not.toBeNull()
    })

    // Should show the recent toma in the "Tomas de hoy" list
    expect(screen.queryByText(/Dada por Ana/)).not.toBeNull()

    // P3: should NOT show the "Última toma" hint (the recent toma block)
    // because it would duplicate the information already shown in "Tomas de hoy"
    expect(screen.queryByText(/próxima disponible en 15 min/)).toBeNull()
  })
})
