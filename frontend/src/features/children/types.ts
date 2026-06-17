/** Claves de la paleta acotada de colores de avatar (0–5, DESIGN.md). */
export const AVATAR_COLORS = [
  'clay',
  'sage',
  'ochre',
  'terracotta',
  'olive',
  'rosewood',
] as const

export type AvatarColor = (typeof AVATAR_COLORS)[number]

/** Un Hijo tal y como lo devuelve el backend. `birth_date` es ISO `yyyy-mm-dd`. */
export type Child = {
  id: string
  family_id: string
  name: string
  birth_date: string
  avatar_color: AvatarColor | null
}

/** Datos que el Miembro aporta al dar de alta un Hijo (sin `family_id`). */
export type ChildInput = {
  name: string
  birth_date: string
  avatar_color?: AvatarColor | null
}

/** Edición parcial: solo los campos presentes se actualizan. */
export type ChildPatch = Partial<ChildInput>
