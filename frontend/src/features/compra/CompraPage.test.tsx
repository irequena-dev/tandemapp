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

describe('CompraPage — edición inline', () => {
  it('Enter guarda la edición; blur la descarta (no commitea por perder foco)', async () => {
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

    // Abre la edición y escribe un texto nuevo.
    fireEvent.click(screen.getByRole('button', { name: /^Editar Leche entera/ }))
    const input = await screen.findByRole('textbox', { name: /Editar Leche entera/ })
    fireEvent.change(input, { target: { value: 'Leche desnatada' } })

    // Blur (perder foco por tab/scroll/notificación): NO commitea.
    fireEvent.blur(input)
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Editar Leche entera/ })).toBeNull(),
    )
    expect(patches).toHaveLength(0)
    // El texto original sigue ahí: no se perdió ni se guardó a medias.
    expect(screen.getByText('Leche entera')).toBeTruthy()

    // Ahora sí: abre, edita y pulsa Enter → commitea.
    fireEvent.click(screen.getByRole('button', { name: /^Editar Leche entera/ }))
    const input2 = await screen.findByRole('textbox', { name: /Editar Leche entera/ })
    fireEvent.change(input2, { target: { value: 'Leche desnatada' } })
    fireEvent.keyDown(input2, { key: 'Enter' })

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0].text).toBe('Leche desnatada')
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

    fireEvent.click(screen.getByRole('button', { name: /^Editar Leche entera/ }))
    const input = await screen.findByRole('textbox', { name: /Editar Leche entera/ })
    // El usuario borra todo y pulsa Enter: tratamos el draft vacío como cancelar.
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: /Editar Leche entera/ })).toBeNull(),
    )
    expect(patches).toHaveLength(0)
    // El ítem original sigue existiendo.
    expect(screen.getByText('Leche entera')).toBeTruthy()
  })
})

describe('CompraPage — acciones de fila accesibles en táctil (hover:none, 44px, focus-visible)', () => {
  // Las acciones de fila (editar/borrar) y el check viven con opacity:0 y se
  // revelan sólo en :hover/:focus-within — pero en un móvil no hay hover, así
  // que son invisibles. El fix es CSS puro (no se ve en el DOM), así que este
  // test ancla las reglas a nivel de fuente para evitar regresiones.
  const css = readFileSync(
    resolve(__dirname, 'compra.css'),
    'utf8',
  )

  it('mantiene las acciones visibles en dispositivos sin hover (@media hover: none)', () => {
    expect(css).toMatch(/@media\s*\(\s*hover:\s*none\s*\)/)
    // Dentro del bloque hover:none, las acciones deben forzar opacity:1.
    const hoverNoneBlock = css.match(/@media\s*\(\s*hover:\s*none\s*\)\s*{([^}]*)}/)
    expect(hoverNoneBlock).not.toBeNull()
    expect(hoverNoneBlock![1]).toMatch(/compra-item__actions/)
    expect(hoverNoneBlock![1]).toMatch(/opacity:\s*1/)
  })

  it('agrandaba el área de toque del check y de las acciones a >=44px', () => {
    // El check pasa de 24px a un área de 44px vía padding/size.
    expect(css).toMatch(/compra-item__check[^{]*\{[^}]*min-width:\s*44px/)
    expect(css).toMatch(/compra-item__check[^{]*\{[^}]*min-height:\s*44px/)
    // Los botones de acción pasan de 32px a 44px.
    expect(css).toMatch(/compra-item__action[^{]*\{[^}]*min-width:\s*44px/)
    expect(css).toMatch(/compra-item__action[^{]*\{[^}]*min-height:\s*44px/)
  })

  it('añade un :focus-visible outline a acciones, toggles y al botón de limpiar', () => {
    // Antes sólo el input de alta tenía focus ring; ahora también las acciones
    // de fila, el check/toggle y el botón de limpiar lo tienen.
    expect(css).toMatch(/compra-item__action:focus-visible/)
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

