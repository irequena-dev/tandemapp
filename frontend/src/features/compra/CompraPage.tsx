import { useState } from 'react'
import { useShoppingItems, useCreateShoppingItem, useBuyShoppingItem, useUndoShoppingItem } from './api'
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

function PendingRow({ item, onBuy }: { item: ShoppingItem; onBuy: () => void }) {
  return (
    <li className="compra-item">
      <button
        type="button"
        className="compra-item__check"
        onClick={onBuy}
        aria-label={`Marcar ${item.text} como comprado`}
      />
      <span className="compra-item__text">{item.text}</span>
    </li>
  )
}

function BoughtRow({ item, onUndo }: { item: ShoppingItem; onUndo: () => void }) {
  return (
    <li className="compra-item compra-item--done">
      <button
        type="button"
        className="compra-item__check compra-item__check--done"
        onClick={onUndo}
        aria-label={`Desmarcar ${item.text}`}
      >
        <CheckIcon />
      </button>
      <span className="compra-item__text">{item.text}</span>
      {item.bought_by && (
        <span className="compra-item__meta">{item.bought_by}</span>
      )}
      <button
        type="button"
        className="compra-item__undo"
        onClick={onUndo}
        aria-label={`Deshacer compra de ${item.text}`}
      >
        Deshacer
      </button>
    </li>
  )
}

export function CompraPage() {
  const { data: items = [], isLoading } = useShoppingItems()
  const createItem = useCreateShoppingItem()
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
              <PendingRow key={item.id} item={item} onBuy={() => buyItem.mutate(item.id)} />
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
          </div>
          {boughtOpen && (
            <ul className="compra__list">
              {bought.map((item) => (
                <BoughtRow key={item.id} item={item} onUndo={() => undoItem.mutate(item.id)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
