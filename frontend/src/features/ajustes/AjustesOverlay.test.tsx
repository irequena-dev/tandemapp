import type { ReactNode } from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/server'

vi.mock('@clerk/react', () => ({
  Show: ({ when, children }: { when: string; children: ReactNode }) =>
    when === 'signed-in' ? children : null,
  UserButton: ({ showName }: { showName?: boolean; appearance?: unknown }) => (
    <div data-testid="clerk-user-button" data-show-name={showName}>
      UserButton
    </div>
  ),
  useUser: () => ({
    user: { fullName: 'Ana Martínez', primaryEmailAddress: { emailAddress: 'ana@test.com' } },
  }),
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

import { AjustesOverlay } from './AjustesOverlay'

const API = 'http://localhost:8000'

function renderOverlay(onClose = vi.fn()) {
  server.use(
    http.get(`${API}/members`, () => HttpResponse.json([])),
    http.get(`${API}/invitations`, () => HttpResponse.json([])),
  )

  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const result = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AjustesOverlay onClose={onClose} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onClose, ...result }
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  // Defaults (menor prioridad): un test puede override con el suyo.
  server.use(
    http.get(`${API}/children`, () => HttpResponse.json([])),
    http.get(`${API}/mcp-tokens`, () => HttpResponse.json([])),
  )
})

describe('AjustesOverlay', () => {
  it('se renderiza con el título "Ajustes" y rol dialog', () => {
    renderOverlay()
    const dialog = screen.getByRole('dialog', { name: /ajustes/i })
    expect(dialog).toBeTruthy()
    expect(screen.getByText('Ajustes')).toBeTruthy()
  })

  it('se cierra al pulsar el botón Cerrar', async () => {
    const user = userEvent.setup()
    const { onClose } = renderOverlay()
    await user.click(screen.getByRole('button', { name: /cerrar ajustes/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('se cierra al pulsar Escape', async () => {
    const user = userEvent.setup()
    const { onClose } = renderOverlay()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('se cierra al hacer click en el backdrop', async () => {
    const user = userEvent.setup()
    const { onClose } = renderOverlay()
    const backdrop = document.querySelector('.ajustes-backdrop')!
    await user.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Apariencia', () => {
  it('muestra tres opciones de tema: Sistema, Claro, Oscuro', () => {
    renderOverlay()
    expect(screen.getByRole('button', { name: /sistema/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /claro/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /oscuro/i })).toBeTruthy()
  })

  it('Sistema es el tema activo por defecto', () => {
    renderOverlay()
    const sistemaBtn = screen.getByRole('button', { name: /sistema/i })
    expect(sistemaBtn.className).toContain('active')
  })

  it('al elegir Oscuro aplica data-theme="dark" y persiste en localStorage', async () => {
    const user = userEvent.setup()
    renderOverlay()
    await user.click(screen.getByRole('button', { name: /oscuro/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('tandem-theme')).toBe('dark')
  })

  it('al elegir Claro aplica data-theme="light" y persiste en localStorage', async () => {
    const user = userEvent.setup()
    renderOverlay()
    await user.click(screen.getByRole('button', { name: /claro/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('tandem-theme')).toBe('light')
  })

  it('al elegir Sistema elimina data-theme y persiste "system"', async () => {
    const user = userEvent.setup()
    renderOverlay()
    await user.click(screen.getByRole('button', { name: /oscuro/i }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    await user.click(screen.getByRole('button', { name: /sistema/i }))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(localStorage.getItem('tandem-theme')).toBe('system')
  })

  it('restaura el tema persistido al montar', () => {
    localStorage.setItem('tandem-theme', 'dark')
    renderOverlay()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    const oscuroBtn = screen.getByRole('button', { name: /oscuro/i })
    expect(oscuroBtn.className).toContain('active')
  })
})

describe('Cuenta', () => {
  it('muestra la sección Cuenta con el UserButton de Clerk', () => {
    renderOverlay()
    const cuentaSection = screen.getByText('Cuenta').closest('section')!
    expect(within(cuentaSection).getByTestId('clerk-user-button')).toBeTruthy()
  })
})

/* ---------- Hijos — gestión real (alta/editar/borrar) ---------- */

const sara = {
  id: 'child-sara',
  family_id: 'fam-1',
  name: 'Sara',
  birth_date: '2021-09-03',
  avatar_color: null,
  current_height_cm: null,
  current_weight_kg: null,
  current_talla: null,
  current_talla_calzado: null,
}

const MONTHS_FULL = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// El día 1 del mes en curso siempre está habilitado en el calendario (<= hoy)
// y no requiere navegar meses: ideal para rellenar la fecha de nacimiento.
function firstOfCurrentMonthLabel(): string {
  const now = new Date()
  return `1 de ${MONTHS_FULL[now.getMonth()]} de ${now.getFullYear()}`
}
function firstOfCurrentMonthISO(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

describe('Hijos — gestión real (alta/editar/borrar)', () => {
  it('lista los Hijos de la API, no los datos mock', async () => {
    server.use(http.get(`${API}/children`, () => HttpResponse.json([sara])))
    renderOverlay()

    expect(await screen.findByText('Sara')).toBeTruthy()
    // Los Hijos del mock-data (Mateo / Lucía) ya no deben aparecer.
    expect(screen.queryByText('Mateo')).toBeNull()
    expect(screen.queryByText('Lucía')).toBeNull()
  })

  it('da de alta un Hijo al enviar el formulario (POST /children)', async () => {
    const created = vi.fn()
    server.use(
      http.get(`${API}/children`, () => HttpResponse.json([])),
      http.post(`${API}/children`, async ({ request }) => {
        created(await request.json())
        return HttpResponse.json(
          { id: 'srv-new', family_id: 'fam-1', name: 'Sara', birth_date: firstOfCurrentMonthISO(), avatar_color: null },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /añadir hijo/i }))
    await user.type(screen.getByLabelText('Nombre'), 'Sara')

    // Calendario custom: abrir y elegir el día 1 del mes en curso.
    await user.click(screen.getByLabelText('Fecha de nacimiento'))
    await user.click(screen.getByRole('gridcell', { name: firstOfCurrentMonthLabel() }))

    await user.click(screen.getByRole('button', { name: 'Añadir' }))

    await waitFor(() =>
      expect(created).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Sara', birth_date: firstOfCurrentMonthISO() }),
      ),
    )
  })

  it('edita el nombre de un Hijo (PATCH /children/:id)', async () => {
    const patched = vi.fn()
    server.use(
      http.get(`${API}/children`, () => HttpResponse.json([sara])),
      http.patch(`${API}/children/${sara.id}`, async ({ request }) => {
        patched(await request.json())
        return HttpResponse.json({ ...sara, name: 'Sara Lúa' })
      }),
    )
    const user = userEvent.setup()
    renderOverlay()

    await screen.findByText('Sara')
    await user.click(screen.getByRole('button', { name: /editar a sara/i }))

    // El formulario de edición viene relleno; cambiamos solo el nombre.
    const nameInput = screen.getByLabelText('Nombre')
    await user.clear(nameInput)
    await user.type(nameInput, 'Sara Lúa')
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    await waitFor(() =>
      expect(patched).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sara Lúa' })),
    )
  })

  it('elimina un Hijo tras confirmar (DELETE /children/:id)', async () => {
    const deleted = vi.fn()
    server.use(
      http.get(`${API}/children`, () => HttpResponse.json([sara])),
      http.delete(`${API}/children/${sara.id}`, () => {
        deleted()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderOverlay()

    await screen.findByText('Sara')
    await user.click(screen.getByRole('button', { name: /eliminar a sara/i }))
    await user.click(screen.getByRole('button', { name: 'Eliminar' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
  })
})

/* ---------- Token MCP — generar y revocar ---------- */

const activeToken = {
  id: 'tok-1',
  created_at: '2026-06-15T10:00:00Z',
  revoked_at: null,
}

describe('Token MCP — generar y revocar', () => {
  it('lista los tokens de la API y no muestra el valor mock mascarado', async () => {
    server.use(http.get(`${API}/mcp-tokens`, () => HttpResponse.json([activeToken])))
    renderOverlay()

    expect(await screen.findByText('Token activo')).toBeTruthy()
    // El placeholder estático mascarado ya no debe aparecer.
    expect(screen.queryByText('mcp_tk_••••••••••••••••')).toBeNull()
  })

  it('genera un token y revela el valor en claro una sola vez (POST /mcp-tokens)', async () => {
    const store: { id: string; created_at: string; revoked_at: string | null }[] = []
    const created = vi.fn()
    server.use(
      http.get(`${API}/mcp-tokens`, () => HttpResponse.json(store)),
      http.post(`${API}/mcp-tokens`, () => {
        created()
        store.unshift({ id: 'tok-new', created_at: '2026-06-15T10:00:00Z', revoked_at: null })
        return HttpResponse.json(
          { id: 'tok-new', token: 'tdm_live_SECRET_123', created_at: '2026-06-15T10:00:00Z' },
          { status: 201 },
        )
      }),
    )
    const user = userEvent.setup()
    renderOverlay()

    await user.click(screen.getByRole('button', { name: /generar token/i }))

    // El valor en claro se revela una sola vez al generar.
    expect(await screen.findByText('tdm_live_SECRET_123')).toBeTruthy()
    expect(created).toHaveBeenCalledOnce()
    // La lista se reconcilia con la metadata del servidor.
    expect(await screen.findByText('Token activo')).toBeTruthy()
  })

  it('revoca un token tras confirmar (DELETE /mcp-tokens/:id)', async () => {
    const deleted = vi.fn()
    server.use(
      http.get(`${API}/mcp-tokens`, () => HttpResponse.json([activeToken])),
      http.delete(`${API}/mcp-tokens/${activeToken.id}`, () => {
        deleted()
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderOverlay()

    await screen.findByText('Token activo')
    await user.click(screen.getByRole('button', { name: 'Revocar' }))
    await user.click(screen.getByRole('button', { name: 'Sí' }))

    await waitFor(() => expect(deleted).toHaveBeenCalledOnce())
  })
})
