import { describe, expect, it } from 'vitest'
import { formatDoseTime } from './formatDoseTime'

describe('formatDoseTime', () => {
  // `now` fijo para que los tests no dependan del reloj ni de la zona horaria
  // del runner: construimos las fechas en hora local y serializamos a ISO, así
  // el round-trip preserva el instante local sin importar el TZ del host.
  it('hoy: devuelve solo la hora HH:MM', () => {
    const now = new Date(2026, 5, 28, 9, 0) // 28 jun 2026, 09:00 local
    const iso = new Date(2026, 5, 28, 10, 33).toISOString()
    expect(formatDoseTime(iso, now)).toBe('10:33')
  })

  it('mañana: antepone "Mañana" (caso del bug de pautas de 24h)', () => {
    const now = new Date(2026, 5, 28, 10, 33) // marcada hoy a las 10:33
    const iso = new Date(2026, 5, 29, 10, 33).toISOString() // próxima: mañana 10:33
    expect(formatDoseTime(iso, now)).toBe('Mañana 10:33')
  })

  it('más allá de mañana: muestra el día de la semana, no solo la hora', () => {
    const now = new Date(2026, 5, 28, 10, 33) // dom 28 jun 2026
    const iso = new Date(2026, 6, 2, 10, 33).toISOString() // jue 2 jul (+4 días)
    const out = formatDoseTime(iso, now)
    expect(out).toContain('10:33')
    expect(out).not.toBe('10:33') // lleva el día de la semana
  })
})
