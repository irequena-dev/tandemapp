/** Visita médica tal como la devuelve el backend. */
export type HealthVisit = {
  id: string
  child_id: string
  family_id: string
  visited_at: string // YYYY-MM-DD
  diagnosis: string
  notes: unknown // JSONB: string | object | array | null
  pauta_ids: string[]
  created_by: string
  created_at: string // ISO datetime
}

/** Datos que el Miembro aporta al registrar una Visita (sin family_id). */
export type HealthVisitInput = {
  visited_at: string
  diagnosis: string
  notes?: unknown
}

/** Edición parcial: solo los campos presentes se actualizan. */
export type HealthVisitPatch = Partial<HealthVisitInput>
