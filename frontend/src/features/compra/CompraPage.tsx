import { useState } from 'react'
import { SHOPPING_ITEMS, type MockShoppingItem } from '../../lib/mock-data'
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

function ItemRow({ item, onToggle }: { item: MockShoppingItem; onToggle: () => void }) {
  return (
    <li className={`compra-item${item.is_bought ? ' compra-item--done' : ''}`}>
      <button
        type="button"
        className={`compra-item__check${item.is_bought ? ' compra-item__check--done' : ''}`}
        onClick={onToggle}
        aria-label={item.is_bought ? `Desmarcar ${item.text}` : `Marcar ${item.text} como comprado`}
      >
        {item.is_bought && <CheckIcon />}
      </button>
      <span className="compra-item__text">{item.text}</span>
      {item.is_bought && item.bought_by && (
        <span className="compra-item__meta">{item.bought_by}</span>
      )}
    </li>
  )
}

export function CompraPage() {
  const [items, setItems] = useState<MockShoppingItem[]>(SHOPPING_ITEMS)
  const [newText, setNewText] = useState('')
  const [boughtOpen, setBoughtOpen] = useState(false)

  const pending = items.filter((i) => !i.is_bought)
  const bought = items.filter((i) => i.is_bought)

  const toggle = (id: string) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              is_bought: !i.is_bought,
              bought_by: !i.is_bought ? 'Ana' : null,
              bought_at: !i.is_bought ? new Date().toISOString() : null,
            }
          : i,
      ),
    )
  }

  const addItem = () => {
    const text = newText.trim()
    if (!text) return
    setItems((prev) => [
      ...prev,
      {
        id: `item-new-${Date.now()}`,
        text,
        is_bought: false,
        bought_by: null,
        bought_at: null,
      },
    ])
    setNewText('')
  }

  const clearBought = () => {
    setItems((prev) => prev.filter((i) => !i.is_bought))
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

      {items.length === 0 && (
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
              <ItemRow key={item.id} item={item} onToggle={() => toggle(item.id)} />
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
            {boughtOpen && (
              <button type="button" className="compra__clear" onClick={clearBought}>
                Limpiar
              </button>
            )}
          </div>
          {boughtOpen && (
            <ul className="compra__list">
              {bought.map((item) => (
                <ItemRow key={item.id} item={item} onToggle={() => toggle(item.id)} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
