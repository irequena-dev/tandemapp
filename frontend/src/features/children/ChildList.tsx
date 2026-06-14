import { ChildListItem } from './ChildListItem'
import type { Child } from './types'

/** Lista presentacional de Hijos: filas agrupadas en una superficie tranquila. */
export function ChildList({ items }: { items: Child[] }) {
  return (
    <ul className="hijos__list">
      {items.map((child) => (
        <ChildListItem key={child.id} child={child} />
      ))}
    </ul>
  )
}
