/** Tipos de dominio para Pautas (tratamientos) y Administraciones. */

export type PautaStatus = 'active' | 'finished'

export type Administration = {
  id: string
  pauta_id: string
  administered_at: string // ISO datetime
  administered_by: string // member_id
  member_name: string | null
  created_at: string
}

export type Pauta = {
  id: string
  family_id: string
  child_id: string
  medication: string
  dose: string
  interval_hours: number
  duration_days: number
  started_at: string // ISO datetime
  ends_at: string // ISO datetime (calculado)
  status: PautaStatus
  health_visit_id: string | null
  created_by: string
  created_at: string
  day_number: number // calculado
  next_dose_at: string | null // ISO datetime; null si finalizada
  todays_administrations: Administration[]
}

export type PautaInput = {
  child_id: string
  medication: string
  dose: string
  interval_hours: number
  duration_days: number
  health_visit_id?: string | null
}
