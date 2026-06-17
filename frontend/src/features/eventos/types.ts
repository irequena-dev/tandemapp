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

/** Hijo expandido inline en un Evento. */
export type ChildSummary = {
  id: string
  family_id: string
  name: string
  birth_date: string
  avatar_color: string | null
}

/** Evento tal como lo devuelve el backend. */
export type EventOut = {
  id: string
  family_id: string
  title: string
  date: string
  time: string | null
  event_type_id: string
  event_type: EventTypeOut
  child_id: string | null
  child: ChildSummary | null
  status: 'pending' | 'done'
  is_overdue: boolean
  series_id: string | null
  created_by: string
  created_at: string
}

/** Cuerpo del alta de un Evento. */
export type EventCreate = {
  title: string
  date: string
  time?: string | null
  event_type_id: string
  child_id?: string | null
}

/** Edición parcial de un Evento. */
export type EventUpdate = {
  title?: string
  date?: string
  time?: string | null
  event_type_id?: string
  child_id?: string | null
}
