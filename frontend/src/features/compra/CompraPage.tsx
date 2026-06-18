import { useRef, useState } from 'react'
import {
  useShoppingItems,
  useCreateShoppingItem,
  useUpdateShoppingItem,
  useDeleteShoppingItem,
  useClearBoughtItems,
  useBuyShoppingItem,
  useUndoShoppingItem,
} from './api'
import type { ShoppingItem } from './types'
import './compra.css'

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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

function ItemRow({
  item,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ShoppingItem
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

  const commitEdit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== item.text) {
      onEdit(trimmed)
    }
    setEditing(false)
  }

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
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          aria-label={`Editar ${item.text}`}
        />
      ) : (
        <span className="compra-item__text">{item.text}</span>
      )}

      {isBought && item.bought_by && (
        <span className="compra-item__meta">{item.bought_by}</span>
      )}

      <div className="compra-item__actions">
        {isBought && (
          <button
            type="button"
            className="compra-item__undo"
            onClick={onToggle}
            aria-label={`Deshacer compra de ${item.text}`}
          >
            Deshacer
          </button>
        )}
        {!editing && (
          <button
            type="button"
            className="compra-item__action"
            onClick={startEdit}
            aria-label={`Editar ${item.text}`}
          >
            <PencilIcon />
          </button>
        )}
        <button
          type="button"
          className="compra-item__action compra-item__action--danger"
          onClick={onDelete}
          aria-label={`Borrar ${item.text}`}
        >
          <TrashIcon />
        </button>
      </div>
    </li>
  )
}

export function CompraPage() {
  const { data: items = [], isLoading } = useShoppingItems()
  const createItem = useCreateShoppingItem()
  const updateItem = useUpdateShoppingItem()
  const deleteItem = useDeleteShoppingItem()
  const clearBought = useClearBoughtItems()
  const buyItem = useBuyShoppingItem()
  const undoItem = useUndoShoppingItem()
  const [newText, setNewText] = useState('')
  const [boughtOpen, setBoughtOpen] = useState(false)

  const pending = items.filter((i) => i.status === 'pending')
  const bought = items.filter((i) => i.status === 'bought')

  const addItem = () => {
    const text = newText.trim()
    if (!text) return
    createItem.mutate({ text })
    setNewText('')
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
              onClick={() => setBoughtOpen(!boughtOpen)}
              aria-expanded={boughtOpen}
            >
              Comprado
              <span className="compra__count">{bought.length}</span>
              <ChevronIcon open={boughtOpen} />
            </button>
            <button
              type="button"
              className="compra__clear"
              onClick={() => clearBought.mutate()}
            >
              Limpiar comprados
            </button>
          </div>
          {boughtOpen && (
            <ul className="compra__list">
              {bought.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
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
