import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { server } from '../../test/server'
import { ToastProvider } from '../toasts/toasts'
import { CompraPage } from './CompraPage'
import type { ShoppingItem } from './types'

vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: async () => 'test-token' }),
}))

const URL = 'http://localhost:8000/api/shopping-items'

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

function renderPage() {
  return render(<CompraPage />, { wrapper: makeWrapper() })
}

/** CompraPage resolve bought_by vía useMembers(); listamos un miembro de
 *  muestra para que la página no fallee al cargar. */
const membersHandler = http.get('http://localhost:8000/members', () =>
  HttpResponse.json([{ id: 'Ana', display_name: 'Ana' }]),
)

const pendingItem = (text: string, id = `p-${text}`): ShoppingItem => ({
  id,
  family_id: 'fam',
  text,
  status: 'pending',
  created_by: 'user-1',
  bought_by: null,
  bought_at: null,
  created_at: '2026-06-17T10:00:00Z',
  updated_at: '2026-06-17T10:00:00Z',
})

const boughtItem = (text: string, id = `b-${text}`): ShoppingItem => ({
  id,
  family_id: 'fam',
  text,
  status: 'bought',
  created_by: 'user-1',
  bought_by: 'Ana',
  bought_at: '2026-06-17T09:30:00Z',
  created_at: '2026-06-17T09:00:00Z',
  updated_at: '2026-06-17T09:30:00Z',
})

/** Despliega la sección "Comprado" (colapsada cuando hay ruido) y espera a que
 *  el texto de un ítem comprado sea visible. */
async function openBoughtThenSee(text: string) {
  const toggle = await screen.findByRole('button', { name: /Comprado/ })
  fireEvent.click(toggle)
  await waitFor(() => expect(screen.getByText(text)).toBeTruthy())
}

describe('CompraPage — Limpiar comprados', () => {
  it('no borra en el primer toque: pide confirmación inline con el conteo', async () => {
    const store: ShoppingItem[] = [
      pendingItem('Leche'),
      boughtItem('Pan'),
      boughtItem('Huevos'),
    ]
    const deletes: string[] = []
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/bought`, () => {
        deletes.push('bought')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche')).toBeTruthy())

    // Un primer toque NO destruye: abre la confirmación inline.
    fireEvent.click(screen.getByRole('button', { name: /Limpiar comprados/ }))
    // La etiqueta incluye el conteo ("¿Borrar N comprados?").
    expect(screen.getByRole('group', { name: /Confirmar borrado de 2 comprados/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Sí, borrar/ })).toBeTruthy()
    expect(deletes).toHaveLength(0)
  })

  it('al confirmar borra y ofrece un toast con "Deshacer" que re-crea los ítems', async () => {
    let store: ShoppingItem[] = [
      pendingItem('Leche'),
      boughtItem('Pan'),
      boughtItem('Huevos'),
    ]
    const created: { text: string }[] = []
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/bought`, () => {
        store = store.filter((i) => i.status !== 'bought')
        return new HttpResponse(null, { status: 204 })
      }),
      http.post(URL, async ({ request }) => {
        const body = (await request.json()) as { text: string }
        created.push(body)
        const item = pendingItem(body.text, `restored-${created.length}`)
        store.push(item)
        return HttpResponse.json(item, { status: 201 })
      }),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche')).toBeTruthy())
    await openBoughtThenSee('Pan')

    fireEvent.click(screen.getByRole('button', { name: /Limpiar comprados/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Sí, borrar/ }))

    // Los comprados desaparecen tras confirmar.
    await waitFor(() => expect(screen.queryByText('Pan')).toBeNull())
    await waitFor(() => expect(screen.queryByText('Huevos')).toBeNull())

    // El toast de deshacer aparece.
    const undo = await screen.findByRole('button', { name: 'Deshacer' })
    fireEvent.click(undo)

    // Re-crea los dos ítems borrados vía create.
    await waitFor(() =>
      expect(created.map((c) => c.text).sort()).toEqual(['Huevos', 'Pan']),
    )
  })

  it('cancelar la confirmación no borra nada', async () => {
    const store: ShoppingItem[] = [pendingItem('Leche'), boughtItem('Pan')]
    const deletes: string[] = []
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/bought`, () => {
        deletes.push('bought')
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche')).toBeTruthy())
    await openBoughtThenSee('Pan')

    fireEvent.click(screen.getByRole('button', { name: /Limpiar comprados/ }))
    fireEvent.click(screen.getByRole('button', { name: 'No' }))

    expect(deletes).toHaveLength(0)
    expect(screen.getByText('Pan')).toBeTruthy()
  })
})
