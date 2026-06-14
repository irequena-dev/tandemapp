import { useState } from 'react'
import { useChildren, useCreateChild } from './api'
import { ChildForm } from './ChildForm'
import { ChildList } from './ChildList'
import './children.css'

const PlusIcon = () => (
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
    className="btn__icon"
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const PeopleIcon = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
    <circle cx="9" cy="7" r="3.2" />
    <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.3A4 4 0 0 1 16 11" />
  </svg>
)

/** Tres filas fantasma mientras carga la lista (sin spinner suelto). */
function ChildListSkeleton() {
  return (
    <ul className="hijos__list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li className="hijos__item" key={i}>
          <div className="hijo-skel-row">
            <span className="skel skel--mono" />
            <span className="skel--lines">
              <span className="skel skel--name" />
              <span className="skel skel--age" />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * Superficie de gestión de Hijos (sección de Ajustes). Orquesta los hooks de
 * datos y los estados (cargando / error / vacío / lista) y la composición del
 * alta como acción deliberada (panel desplegable), no como ruido permanente.
 */
export function ChildrenPage() {
  const { data: children, isPending, isError, refetch } = useChildren()
  const create = useCreateChild()
  const [adding, setAdding] = useState(false)
  // Cambiar la `key` tras un alta correcta remonta el formulario y lo limpia.
  const [formKey, setFormKey] = useState(0)

  const isEmpty = children?.length === 0
  const hasItems = children && children.length > 0

  const handleAdd = () => {
    setAdding(true)
  }

  const closeForm = () => {
    setAdding(false)
    setFormKey((k) => k + 1)
  }

  return (
    <main className="hijos" aria-labelledby="children-title">
      <div className="hijos__head">
        <div className="hijos__heading">
          <h1 className="hijos__title" id="children-title">
            Hijos
          </h1>
          <p className="hijos__subtitle">
            Las personas a tu cargo en la Familia. A cada Hijo se le asocian sus
            medidas, tallas, salud y agenda.
          </p>
        </div>
        {!adding && (
          <button type="button" className="btn btn--primary" onClick={handleAdd}>
            <PlusIcon />
            Añadir Hijo
          </button>
        )}
      </div>

      {adding && (
        <section className="hijos__add" aria-label="Añadir Hijo">
          <p className="hijos__form-title">Añadir Hijo</p>
          <ChildForm
            key={formKey}
            submitLabel="Añadir"
            pending={create.isPending}
            hasError={create.isError}
            onSubmit={(input) =>
              create.mutate(input, { onSuccess: closeForm })
            }
            onCancel={closeForm}
          />
        </section>
      )}

      {isPending && <ChildListSkeleton />}

      {isError && (
        <div className="hijos__error" role="alert">
          <p className="hijos__error-text">
            No se han podido cargar los Hijos. Comprueba tu conexión e inténtalo
            de nuevo.
          </p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => refetch()}
          >
            Reintentar
          </button>
        </div>
      )}

      {isEmpty && !adding && (
        <div className="hijos__empty">
          <span className="hijos__empty-icon" aria-hidden="true">
            <PeopleIcon />
          </span>
          <p className="hijos__empty-title">Aún no has añadido a ningún Hijo</p>
          <p className="hijos__empty-text">
            Añádelos para empezar a asociarles medidas, tallas, salud y agenda.
          </p>
          <button type="button" className="btn btn--primary" onClick={handleAdd}>
            <PlusIcon />
            Añadir Hijo
          </button>
        </div>
      )}

      {hasItems && <ChildList items={children} />}
    </main>
  )
}
