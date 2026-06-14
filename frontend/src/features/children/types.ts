/** Un Hijo tal y como lo devuelve el backend. `birth_date` es ISO `yyyy-mm-dd`. */
export type Child = {
  id: string
  family_id: string
  name: string
  birth_date: string
}

/** Datos que el Miembro aporta al dar de alta un Hijo (sin `family_id`). */
export type ChildInput = {
  name: string
  birth_date: string
}

/** Edición parcial: solo los campos presentes se actualizan. */
export type ChildPatch = Partial<ChildInput>
