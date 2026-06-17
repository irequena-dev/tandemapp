/** Tipo de Evento tal como lo devuelve el backend. */
export type EventTypeOut = {
  id: string
  family_id: string | null
  name: string
  icon: string
  is_system: boolean
}

/** Cuerpo del alta de un Tipo de Evento personalizado. */
export type EventTypeCreate = {
  name: string
  icon?: string
}

/** Edición parcial de un Tipo de Evento personalizado. */
export type EventTypeUpdate = {
  name?: string
  icon?: string
}
