import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { HttpResponse, http } from 'msw'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

/** Despliega la sección "Comprado" (puede venir abierta o cerrada según el
 *  conteo) y espera a que el texto de un ítem comprado sea visible. */
async function openBoughtThenSee(text: string) {
  const toggle = await screen.findByRole('button', { name: /Comprado/ })
  // Sólo togglear si está colapsada: la sección arranca abierta con poco ruido.
  if (toggle.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(toggle)
  }
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

describe('CompraPage — sección "Comprado" abierta por defecto cuando hay poco', () => {
  it('muestra los comprados sin desplegar cuando son <= 8 (señal social a la vista)', async () => {
    const bought: ShoppingItem[] = Array.from({ length: 8 }, (_, i) =>
      boughtItem(`Item ${i}`),
    )
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json([...bought, pendingItem('Leche')])),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche')).toBeTruthy())

    // Con 8 comprados, la sección arranca ABIERTA: el "quién compró qué" se ve
    // sin un toque extra (alivio de carga mental).
    const toggle = screen.getByRole('button', { name: /Comprado/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Item 0')).toBeTruthy()
  })

  it('colapsa por defecto cuando hay ruido (> 8 comprados)', async () => {
    const bought: ShoppingItem[] = Array.from({ length: 9 }, (_, i) =>
      boughtItem(`Item ${i}`),
    )
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json([...bought, pendingItem('Leche')])),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche')).toBeTruthy())

    // Con 9, el ruido gana: arranca colapsada y la píldora resume el conteo.
    const toggle = screen.getByRole('button', { name: /Comprado/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Item 0')).toBeNull()
  })
})

function openItemMenu(itemText: string) {
  const menuButton = screen.getByRole('button', { name: `Menú de acciones de ${itemText}` })
  fireEvent.click(menuButton)
  return menuButton
}

describe('CompraPage — menú de acciones de tres puntos', () => {
  it('muestra el menú de acciones siempre visible en cada fila', async () => {
    const store: ShoppingItem[] = [pendingItem('Leche entera')]
    server.use(membersHandler, http.get(URL, () => HttpResponse.json(store)))

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeTruthy())

    expect(screen.getByRole('button', { name: /Menú de acciones de Leche entera/ })).toBeTruthy()
  })

  it('abre el desplegable y dispara Editar desde el menú', async () => {
    let store: ShoppingItem[] = [pendingItem('Leche entera')]
    const patches: { id: string; text: string }[] = []
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json(store)),
      http.patch(`${URL}/:id`, async ({ request, params }) => {
        const body = (await request.json()) as { text: string }
        patches.push({ id: params['id'] as string, text: body.text })
        store = store.map((i) =>
          i.id === params['id'] ? { ...i, text: body.text } : i,
        )
        return HttpResponse.json(store[0])
      }),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeTruthy())

    openItemMenu('Leche entera')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Editar Leche entera/ }))

    const input = await screen.findByRole('textbox', { name: /Editar Leche entera/ })
    fireEvent.change(input, { target: { value: 'Leche desnatada' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].text).toBe('Leche desnatada')
  })

  it('abre el desplegable y dispara Borrar desde el menú', async () => {
    let store: ShoppingItem[] = [pendingItem('Leche entera')]
    const deleted: string[] = []
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json(store)),
      http.delete(`${URL}/:id`, ({ params }) => {
        deleted.push(params['id'] as string)
        store = store.filter((i) => i.id !== params['id'])
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeTruthy())

    openItemMenu('Leche entera')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Borrar Leche entera/ }))

    await waitFor(() => expect(screen.queryByText('Leche entera')).toBeNull())
    expect(deleted).toHaveLength(1)
    expect(deleted[0]).toBe('p-Leche entera')
  })

  it('cierra el desplegable al tocar fuera', async () => {
    const store: ShoppingItem[] = [pendingItem('Leche entera'), pendingItem('Pan')]
    server.use(membersHandler, http.get(URL, () => HttpResponse.json(store)))

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeTruthy())

    openItemMenu('Leche entera')
    expect(screen.getByRole('menuitem', { name: /^Editar Leche entera/ })).toBeTruthy()

    fireEvent.mouseDown(document.body)

    await waitFor(() =>
      expect(screen.queryByRole('menuitem', { name: /^Editar Leche entera/ })).toBeNull(),
    )
  })

  it('muestra el nombre del comprador a la izquierda del menú en ítems comprados', async () => {
    const store: ShoppingItem[] = [boughtItem('Pan')]
    server.use(membersHandler, http.get(URL, () => HttpResponse.json(store)))

    renderPage()
    await openBoughtThenSee('Pan')

    // El nombre del comprador está visible junto al menú.
    expect(screen.getByText('Ana')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Menú de acciones de Pan/ })).toBeTruthy()
  })

  it('un borrón en blanco (draft vacío) descarta, no borra el ítem', async () => {
    const store: ShoppingItem[] = [pendingItem('Leche entera')]
    const patches: { id: string; text: string }[] = []
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json(store)),
      http.patch(`${URL}/:id`, async ({ params }) => {
        patches.push({ id: params['id'] as string, text: '' })
        return HttpResponse.json(store[0])
      }),
    )

    renderPage()
    await waitFor(() => expect(screen.getByText('Leche entera')).toBeTruthy())

    openItemMenu('Leche entera')
    fireEvent.click(screen.getByRole('menuitem', { name: /^Editar Leche entera/ }))
    const input = await screen.findByRole('textbox', { name: /Editar Leche entera/ })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Editar Leche entera/ })).toBeNull(),
    )
    expect(patches).toHaveLength(0)
    expect(screen.getByText('Leche entera')).toBeTruthy()
  })
})

describe('CompraPage — acciones de fila accesibles (44px, focus-visible)', () => {
  const css = readFileSync(resolve(__dirname, 'compra.css'), 'utf8')

  it('agrandaba el área de toque del check y del botón de menú a >=44px', () => {
    expect(css).toMatch(/compra-item__check[^{]*\{[^}]*min-width:\s*44px/)
    expect(css).toMatch(/compra-item__check[^{]*\{[^}]*min-height:\s*44px/)
    expect(css).toMatch(/compra-item__menu-button[^{]*\{[^}]*min-width:\s*44px/)
    expect(css).toMatch(/compra-item__menu-button[^{]*\{[^}]*min-height:\s*44px/)
  })

  it('añade un :focus-visible outline al menú, opciones, check y botón de limpiar', () => {
    expect(css).toMatch(/compra-item__menu-button:focus-visible/)
    expect(css).toMatch(/compra-item__menu-option:focus-visible/)
    expect(css).toMatch(/compra-item__check:focus-visible/)
    expect(css).toMatch(/compra__clear:focus-visible/)
  })
})

describe('CompraPage — glyph del check invertible por tema (dark mode)', () => {
  // CheckIcon hardcodeaba stroke="#fff": en dark mode el success es una sage
  // clara (#93b382) y blanco sobre sage clara falla contraste — el check casi
  // desaparece. El fix es que el glyph use currentColor y un color de tinta que
  // invierte por tema. Anclamos ambos a nivel fuente y DOM.
  const tsx = readFileSync(resolve(__dirname, 'CompraPage.tsx'), 'utf8')

  it('el glyph del check no hardcodea blanco (#fff)', () => {
    expect(tsx).not.toMatch(/stroke="#fff"/)
  })

  it('el glyph del check usa currentColor para heredar el contraste del padre', () => {
    expect(tsx).toMatch(/stroke="currentColor"/)
  })

  it('el CSS pinta el check done con una tinta que invierte por tema (--ds-success-ink)', () => {
    const cssSrc = readFileSync(resolve(__dirname, 'compra.css'), 'utf8')
    // La regla del check marcado define el color del glyph (currentColor arriba).
    expect(cssSrc).toMatch(/compra-item__check--done[^{]*\{[^}]*color:\s*var\(--ds-success-ink\)/)
  })

  it('al renderizar un ítem comprado, el check no lleva stroke="#fff" literal', async () => {
    server.use(
      membersHandler,
      http.get(URL, () => HttpResponse.json([boughtItem('Pan')])),
    )
    renderPage()
    await waitFor(() => expect(screen.getByText('Pan')).toBeTruthy())

    const checkSvg = document.querySelector('.compra-item__check svg')
    expect(checkSvg).not.toBeNull()
    expect(checkSvg!.getAttribute('stroke')).not.toBe('#fff')
  })
})

