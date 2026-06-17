import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
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
