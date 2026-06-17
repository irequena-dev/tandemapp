/** Talla tal como la devuelve el backend. */
export type SizeOut = {
  id: string
  child_id: string
  type: 'clothing' | 'footwear'
  label: string
  recorded_at: string // YYYY-MM-DD
  recorded_by: string
  created_at: string
}

/** Alta de una Talla (sin family_id ni recorded_by). */
export type SizeCreate = {
  type: 'clothing' | 'footwear'
  label: string
  recorded_at: string // YYYY-MM-DD
}

/** Edición parcial de una Talla. */
export type SizeUpdate = {
  label?: string
  recorded_at?: string
}

/** Tallas actuales por tipo. */
export type CurrentSizesOut = {
  clothing: SizeOut | null
  footwear: SizeOut | null
}
