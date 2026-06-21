import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  useShoppingItems,
  useCreateShoppingItem,
  useUpdateShoppingItem,
  useDeleteShoppingItem,
  useClearBoughtItems,
  useBuyShoppingItem,
  useUndoShoppingItem,
} from './api'
import { useMembers } from '../members/api'
import { useToast } from '../toasts/useToast'
import type { ShoppingItem } from './types'
import './compra.css'

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`compra__bought-chevron${open ? ' compra__bought-chevron--open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function CartIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
      <path d="M2.5 3h2.2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  )
}

function MoreVerticalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

function ItemMenu({
  itemText,
  onEdit,
  onDelete,
}: {
  itemText: string
  onEdit: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  const handleEdit = () => {
    setOpen(false)
    onEdit()
  }

  const handleDelete = () => {
    setOpen(false)
    onDelete()
  }

  return (
    <div className="compra-item__menu">
      <button
        ref={buttonRef}
        type="button"
        className="compra-item__menu-button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Menú de acciones de ${itemText}`}
      >
        <MoreVerticalIcon />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="compra-item__menu-dropdown"
          role="menu"
          aria-orientation="vertical"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="compra-item__menu-option"
            role="menuitem"
            onClick={handleEdit}
            aria-label={`Editar ${itemText}`}
          >
            <PencilIcon />
            <span>Editar</span>
          </button>
          <button
            type="button"
            className="compra-item__menu-option compra-item__menu-option--danger"
            role="menuitem"
            onClick={handleDelete}
            aria-label={`Borrar ${itemText}`}
          >
            <TrashIcon />
            <span>Borrar</span>
          </button>
        </div>
      )}
    </div>
  )
}

function ItemRow({
  item,
  boughtByName,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ShoppingItem
  boughtByName?: string
  onToggle: () => void
  onEdit: (text: string) => void
  onDelete: () => void
}) {
  const isBought = item.status === 'bought'
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    setDraft(item.text)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  // Commit solo con Enter explícito. Un blur (tab, scroll, notificación,
  // navegación) se trata como descartar: nunca guardamos un texto a medias ni
  // perdemos lo escrito por un cambio de foco ajeno al usuario. El draft vacío
  // también descarta — un borrón nunca borra el ítem silenciosamente.
  const commitEdit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.text) {
      onEdit(trimmed)
    }
    setEditing(false)
  }

  const cancelEdit = () => setEditing(false)

  return (
    <li className={`compra-item${isBought ? ' compra-item--done' : ''}`}>
      <button
        type="button"
        className={`compra-item__check${isBought ? ' compra-item__check--done' : ''}`}
        onClick={onToggle}
        aria-label={isBought ? `Desmarcar ${item.text}` : `Marcar ${item.text} como comprado`}
      >
        {isBought && <CheckIcon />}
      </button>

      {editing ? (
        <input
          ref={inputRef}
          className="compra-item__edit-input"
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={cancelEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') cancelEdit()
          }}
          aria-label={`Editar ${item.text}`}
        />
      ) : (
        <span className="compra-item__text">{item.text}</span>
      )}

      <div className="compra-item__actions">
        {isBought && boughtByName && (
          <span className="compra-item__meta">{boughtByName}</span>
        )}
        {!editing && (
          <ItemMenu
            itemText={item.text}
            onEdit={startEdit}
            onDelete={onDelete}
          />
        )}
      </div>
    </li>
  )
}

export function CompraPage() {
  const { data: items = [], isLoading } = useShoppingItems()
  const { data: members = [] } = useMembers()
  const createItem = useCreateShoppingItem()
  const updateItem = useUpdateShoppingItem()
  const deleteItem = useDeleteShoppingItem()
  const clearBought = useClearBoughtItems()
  const buyItem = useBuyShoppingItem()
  const undoItem = useUndoShoppingItem()
  const toast = useToast()
  const [newText, setNewText] = useState('')
  // La sección "Comprado" arranca abierta cuando hay poco (<= 8): la señal
  // social de "quién compró qué" se ve de un vistazo. Con ruido (> 8) colapsa
  // y deja que la píldora de conteo resuma. Como los ítems llegan tras el
  // primer render (loading), el default se deriva del conteo hasta que el
  // usuario lo toca; a partir de ahí respetamos su elección.
  const [boughtOpenOverride, setBoughtOpenOverride] = useState<boolean | null>(null)
  // "Limpiar comprados" es destructivo e irreversible por backend: lo gatingamos
  // tras una confirmación inline (patrón .hijo-confirm de Hijos) y, al ejecutarlo,
  // ofrecemos un toast con "Deshacer" que re-crea los ítems vía create.
  const [confirmingClear, setConfirmingClear] = useState(false)

  // Resuelve bought_by (id de Clerk, p. ej. "user_xxx") al display_name del miembro.
  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of members) map.set(m.id, m.display_name ?? m.id)
    return map
  }, [members])

  const pending = items.filter((i) => i.status === 'pending')
  const bought = items.filter((i) => i.status === 'bought')
  const boughtOpen =
    boughtOpenOverride !== null ? boughtOpenOverride : bought.length <= 8

  const addItem = () => {
    const text = newText.trim()
    if (!text) return
    createItem.mutate({ text })
    setNewText('')
  }

  // Ejecuta la limpieza de comprados y, si quedaba algo que borrar, ofrece un
  // "Deshacer" que re-crea los ítems (texto) vía create. Un resbalón de pulgar
  // nunca debe borrar silenciosamente la pista de quién compró qué.
  const confirmClearBought = () => {
    const toClear = bought
    setConfirmingClear(false)
    if (toClear.length === 0) return
    clearBought.mutate(undefined, {
      onSuccess: () => {
        toast.info(
          <>
            <strong>{toClear.length} comprados borrados.</strong>{' '}
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                for (const it of toClear) {
                  createItem.mutate({ text: it.text })
                }
              }}
            >
              Deshacer
            </button>
          </>,
          { duration: 6000 },
        )
      },
      onError: () => toast.error('No se pudieron borrar los comprados'),
    })
  }

  return (
    <div className="compra" aria-labelledby="compra-title">
      <div className="compra__head">
        <h1 className="compra__title" id="compra-title">Compra</h1>
      </div>

      <form
        className="compra__add"
        onSubmit={(e) => {
          e.preventDefault()
          addItem()
        }}
      >
        <input
          className="compra__add-input"
          type="text"
          placeholder="Añadir ítem…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
        />
        <button type="submit" className="btn btn--primary" disabled={!newText.trim()}>
          Añadir
        </button>
      </form>

      {isLoading && <p className="compra__loading">Cargando…</p>}

      {!isLoading && items.length === 0 && (
        <div className="compra__empty">
          <span className="compra__empty-icon" aria-hidden="true">
            <CartIcon />
          </span>
          <p className="compra__empty-title">Lista vacía</p>
          <p className="compra__empty-text">
            Añade lo que necesites comprar, o díctalo por voz a Claude.
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <section className="compra__section">
          <div className="compra__section-head">
            <h2 className="compra__section-title">Por comprar</h2>
            <span className="compra__count">{pending.length}</span>
          </div>
          <ul className="compra__list">
            {pending.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                boughtByName={item.bought_by ? nameById.get(item.bought_by) ?? item.bought_by : undefined}
                onToggle={() => buyItem.mutate(item.id)}
                onEdit={(text) => updateItem.mutate({ id: item.id, text })}
                onDelete={() => deleteItem.mutate(item.id)}
              />
            ))}
          </ul>
        </section>
      )}

      {bought.length > 0 && (
        <section className="compra__section">
          <div className="compra__section-head">
            <button
              type="button"
              className="compra__bought-toggle"
              onClick={() => setBoughtOpenOverride(!boughtOpen)}
              aria-expanded={boughtOpen}
            >
              Comprado
              <span className="compra__count">{bought.length}</span>
              <ChevronIcon open={boughtOpen} />
            </button>
            <button
              type="button"
              className="compra__clear"
              onClick={() => setConfirmingClear(true)}
              disabled={confirmingClear}
            >
              Limpiar comprados
            </button>
          </div>
          {confirmingClear && (
            <div
              className="compra__confirm"
              role="group"
              aria-label={`Confirmar borrado de ${bought.length} comprados`}
            >
              <span className="compra__confirm-label">
                ¿Borrar <b className="ds-nums">{bought.length}</b> comprados?
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setConfirmingClear(false)}
              >
                No
              </button>
              <button
                type="button"
                className="btn btn--danger-solid btn--sm"
                onClick={confirmClearBought}
                disabled={clearBought.isPending}
              >
                {clearBought.isPending ? 'Borrando…' : 'Sí, borrar'}
              </button>
            </div>
          )}
          {boughtOpen && (
            <ul className="compra__list">
              {bought.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  boughtByName={item.bought_by ? nameById.get(item.bought_by) ?? item.bought_by : undefined}
                  onToggle={() => undoItem.mutate(item.id)}
                  onEdit={(text) => updateItem.mutate({ id: item.id, text })}
                  onDelete={() => deleteItem.mutate(item.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
