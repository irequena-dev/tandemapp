/** Un Ítem de compra tal y como lo devuelve el backend. */
export type ShoppingItem = {
  id: string
  family_id: string
  text: string
  status: 'pending' | 'bought'
  created_by: string
  created_at: string
  updated_at: string
}

/** Datos que el Miembro aporta al dar de alta un Ítem (solo texto libre). */
export type ShoppingItemInput = {
  text: string
}

/** Datos que el Miembro edita de un Ítem (solo texto libre). */
export type ShoppingItemUpdate = {
  text: string
}
