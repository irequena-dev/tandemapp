import { ChildListItem } from './ChildListItem'
import type { Child } from './types'

/** Lista presentacional de Hijos: mapea cada uno a su fila `ChildListItem`. */
export function ChildList({ items }: { items: Child[] }) {
  return (
    <ul>
      {items.map((child) => (
        <ChildListItem key={child.id} child={child} />
      ))}
    </ul>
  )
}
