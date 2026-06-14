import { useState } from 'react'
import { useChildren, useCreateChild } from './api'
import { ChildForm } from './ChildForm'
import { ChildList } from './ChildList'

/**
 * Contenedor de la gestión de Hijos: orquesta los hooks de datos y los estados
 * (cargando / error / vacío) y compone las piezas presentacionales
 * (`ChildForm`, `ChildList`). La lógica de datos vive aquí y en los hooks; el
 * estilo de cada pieza se reestiliza por separado.
 */
export function ChildrenPage() {
  const { data: children, isPending, isError } = useChildren()
  const create = useCreateChild()
  // Cambiar la `key` tras un alta correcta remonta el formulario y lo limpia.
  const [formKey, setFormKey] = useState(0)

  return (
    <main aria-labelledby="children-title">
      <h1 id="children-title">Hijos</h1>

      <ChildForm
        key={formKey}
        submitLabel="Añadir"
        pending={create.isPending}
        hasError={create.isError}
        onSubmit={(input) =>
          create.mutate(input, { onSuccess: () => setFormKey((k) => k + 1) })
        }
      />

      {isPending && <p>Cargando…</p>}
      {isError && <p role="alert">No se han podido cargar los Hijos.</p>}
      {children?.length === 0 && <p>Aún no hay Hijos dados de alta.</p>}
      {children && children.length > 0 && <ChildList items={children} />}
    </main>
  )
}
