import { useState } from 'react'
import { useCreateSize, useCurrentSizes, useDeleteSize, useSizes, useUpdateSize } from './api'
import type { SizeCreate, SizeOut } from './types'
import { useToast } from '../toasts/useToast'

/** Mapeo de type interno → etiqueta UI (CONTEXT.md). */
const TYPE_LABELS: Record<string, string> = {
  clothing: 'Talla',
  footwear: 'Calzado',
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/* ---------- Inline form for add/edit ---------- */

type SizeFormProps = {
  initial?: { label: string; recorded_at: string }
  sizeType: 'clothing' | 'footwear'
  onSubmit: (data: { label: string; recorded_at: string }) => void
  onCancel: () => void
  submitLabel: string
}

function SizeForm({ initial, sizeType, onSubmit, onCancel, submitLabel }: SizeFormProps) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [recordedAt, setRecordedAt] = useState(initial?.recorded_at ?? todayISO())

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    onSubmit({ label: trimmed, recorded_at: recordedAt })
  }

  return (
    <form className="size-form" onSubmit={handleSubmit} data-testid={`size-form-${sizeType}`}>
      <input
        className="size-form__input"
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder={sizeType === 'clothing' ? 'p. ej. 5-6 años' : 'p. ej. 29'}
        required
        autoFocus
        aria-label={`${TYPE_LABELS[sizeType]}`}
      />
      <input
        className="size-form__date"
        type="date"
        value={recordedAt}
        onChange={(e) => setRecordedAt(e.target.value)}
        aria-label="Fecha de registro"
      />
      <div className="size-form__actions">
        <button type="submit" className="size-form__btn size-form__btn--primary">
          {submitLabel}
        </button>
        <button type="button" className="size-form__btn size-form__btn--secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/* ---------- Single size type block ---------- */

type SizeTypeBlockProps = {
  childId: string
  sizeType: 'clothing' | 'footwear'
  current: SizeOut | null
  history: SizeOut[]
}

function SizeTypeBlock({ childId, sizeType, current, history }: SizeTypeBlockProps) {
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  // Confirmación inline de borrado (patrón .hijo-confirm): antes de destruir
  // una Talla pedimos confirmación y, al borrar con éxito, ofrecemos un toast
  // con "Deshacer" que la re-crea vía create.
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const createMutation = useCreateSize(childId)
  const updateMutation = useUpdateSize(childId)
  const deleteMutation = useDeleteSize(childId)
  const toast = useToast()

  const label = TYPE_LABELS[sizeType]

  const handleAdd = (data: { label: string; recorded_at: string }) => {
    const input: SizeCreate = { type: sizeType, ...data }
    createMutation.mutate(input)
    setShowAdd(false)
  }

  const handleEdit = (id: string, data: { label: string; recorded_at: string }) => {
    updateMutation.mutate({ id, patch: data })
    setEditingId(null)
  }

  const handleConfirmDelete = (s: SizeOut) => {
    deleteMutation.mutate(s.id, {
      onSuccess: () => {
        setConfirmingId(null)
        toast.success(
          <>
            <strong>{label} borrada.</strong>{' '}
            <button
              type="button"
              className="toast__action"
              onClick={() =>
                createMutation.mutate({
                  type: s.type,
                  label: s.label,
                  recorded_at: s.recorded_at,
                })
              }
            >
              Deshacer
            </button>
          </>,
          { duration: 6000 },
        )
      },
      onError: () => toast.error(`No se pudo borrar la ${label.toLowerCase()}`),
    })
  }

  return (
    <div className="size-block" data-testid={`size-block-${sizeType}`}>
      <div className="size-block__header">
        <span className="size-block__label">{label}</span>
        {current ? (
          <span className="size-block__current ds-nums">{current.label}</span>
        ) : (
          <span className="size-block__empty">Sin registro</span>
        )}
        {!showAdd && (
          <button
            type="button"
            className="size-block__add-btn"
            onClick={() => setShowAdd(true)}
            aria-label={`Añadir ${label}`}
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {showAdd && (
        <SizeForm
          sizeType={sizeType}
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
          submitLabel="Guardar"
        />
      )}

      {history.length > 0 && (
        <button
          type="button"
          className="size-block__history-toggle"
          onClick={() => setShowHistory(!showHistory)}
        >
          {showHistory ? 'Ocultar historial' : `Ver historial (${history.length})`}
        </button>
      )}

      {showHistory && (
        <ul className="size-block__history">
          {history.map((s) =>
            editingId === s.id ? (
              <li key={s.id} className="size-history-row">
                <SizeForm
                  sizeType={sizeType}
                  initial={{ label: s.label, recorded_at: s.recorded_at }}
                  onSubmit={(data) => handleEdit(s.id, data)}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Actualizar"
                />
              </li>
            ) : (
              <li key={s.id} className="size-history-row">
                <span className="size-history-row__date">{formatDate(s.recorded_at)}</span>
                <span className="size-history-row__label ds-nums">{s.label}</span>
                {confirmingId === s.id ? (
                  <div
                    className="hijo-confirm size-history-row__confirm"
                    role="group"
                    aria-label={`Borrar ${label}`}
                  >
                    <span className="hijo-confirm__label">¿Borrar?</span>
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => setConfirmingId(null)}
                      disabled={deleteMutation.isPending}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn btn--danger-solid btn--sm"
                      onClick={() => handleConfirmDelete(s)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? 'Borrando…' : 'Borrar'}
                    </button>
                  </div>
                ) : (
                  <div className="size-history-row__actions">
                    <button
                      type="button"
                      className="size-history-row__btn"
                      onClick={() => setEditingId(s.id)}
                      aria-label={`Editar ${label}`}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="size-history-row__btn size-history-row__btn--danger"
                      onClick={() => setConfirmingId(s.id)}
                      aria-label={`Borrar ${label}`}
                    >
                      Borrar
                    </button>
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}

/* ---------- Main section ---------- */

export function SizesSection({ childId }: { childId: string }) {
  const { data: current, isLoading: loadingCurrent } = useCurrentSizes(childId)
  const { data: allSizes, isLoading: loadingSizes } = useSizes(childId)

  if (loadingCurrent || loadingSizes) {
    return (
      <section className="hijo-detail__section">
        <h2 className="hijo-detail__section-title">Tallas</h2>
        <div className="hijo-detail__empty">Cargando tallas...</div>
      </section>
    )
  }

  const clothingHistory = (allSizes ?? []).filter((s) => s.type === 'clothing')
  const footwearHistory = (allSizes ?? []).filter((s) => s.type === 'footwear')

  return (
    <section className="hijo-detail__section" data-testid="sizes-section">
      <h2 className="hijo-detail__section-title">Tallas</h2>
      <div className="sizes-grid">
        <SizeTypeBlock
          childId={childId}
          sizeType="clothing"
          current={current?.clothing ?? null}
          history={clothingHistory}
        />
        <SizeTypeBlock
          childId={childId}
          sizeType="footwear"
          current={current?.footwear ?? null}
          history={footwearHistory}
        />
      </div>
    </section>
  )
}
