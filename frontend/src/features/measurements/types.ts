/** Medida tal y como la devuelve el backend. */
export type Measurement = {
  id: string
  child_id: string
  type: 'height' | 'weight'
  value: number
  unit: string
  measured_at: string // YYYY-MM-DD
  recorded_by: string
  created_at: string
}

/** Datos que el Miembro aporta al registrar una Medida. */
export type MeasurementInput = {
  type: 'height' | 'weight'
  value: number
  unit: string
  measured_at: string
}

/** Corrección parcial de una Medida. */
export type MeasurementPatch = {
  value?: number
  unit?: string
  measured_at?: string
}

/** Valores más recientes por tipo. */
export type CurrentMeasurements = {
  height: Measurement | null
  weight: Measurement | null
}
