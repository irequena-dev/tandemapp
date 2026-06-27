import { useState } from 'react'
import { formatAge } from './age'
import { useDeleteChild, useUpdateChild } from './api'
import { initialOf, resolveColor, toneIndex } from './avatar'
import { ChildForm } from './ChildForm'
import type { Child } from './types'

const PencilIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
)

const TrashIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
)



/**
 * Una fila de la lista de Hijos: vista de lectura (monograma + nombre + edad
 * derivada + métricas actuales) con acciones de editar/eliminar, y modo edición
 * que reutiliza `ChildForm`. Las filas optimistas (aún sin confirmar) se ven
 * atenuadas y no son accionables; la baja pide confirmación inline.
 */
export function ChildListItem({ child }: { child: Child }) {
  const update = useUpdateChild()
  const remove = useDeleteChild()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const isOptimistic = child.id.startsWith('optimistic-')

  if (editing) {
    return (
      <li className="hijos__item hijos__item--form">
        <p className="hijos__form-title">Editar Hijo</p>
        <ChildForm
          submitLabel="Guardar"
          pending={update.isPending}
          hasError={update.isError}
          initialName={child.name}
          initialBirthDate={child.birth_date}
          initialAvatarColor={child.avatar_color}
          onSubmit={(patch) =>
            update.mutate(
              { id: child.id, patch },
              { onSuccess: () => setEditing(false) },
            )
          }
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  return (
    <li className="hijos__item">
      <div
        className={`hijo-row${isOptimistic ? ' hijo-row--pending' : ''}`}
        aria-busy={isOptimistic || undefined}
      >
        <span className="hijo-mono" data-tone={toneIndex(resolveColor(child.avatar_color, child.id))} aria-hidden="true">
          {initialOf(child.name)}
        </span>
        <span className="hijo-row__text">
          <span className="hijo-row__name">{child.name}</span>
          <span className="hijo-row__age ds-nums">{formatAge(child.birth_date)}</span>
        </span>

        {!confirming && (
          <span className="hijo-row__actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={`Editar a ${child.name}`}
              title="Editar"
              onClick={() => setEditing(true)}
              disabled={isOptimistic}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              className="icon-btn icon-btn--danger"
              aria-label={`Eliminar a ${child.name}`}
              title="Eliminar"
              onClick={() => setConfirming(true)}
              disabled={isOptimistic || remove.isPending}
            >
              <TrashIcon />
            </button>
          </span>
        )}
      </div>

      {confirming && (
        <div
          className="hijo-confirm"
          role="group"
          aria-label={`Confirmar eliminación de ${child.name}`}
        >
          <span className="hijo-confirm__label">
            ¿Eliminar a <b>{child.name}</b>?
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={() => setConfirming(false)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn--danger-solid btn--sm"
            onClick={() => remove.mutate(child.id)}
            disabled={remove.isPending}
          >
            {remove.isPending ? 'Eliminando…' : 'Eliminar'}
          </button>
        </div>
      )}
    </li>
  )
}
