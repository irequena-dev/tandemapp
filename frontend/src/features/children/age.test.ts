import { describe, expect, it } from 'vitest'
import { calculateAge, formatAge } from './age'

const now = new Date('2026-06-14T12:00:00')

describe('calculateAge', () => {
  it('cuenta años y meses cumplidos', () => {
    expect(calculateAge('2020-05-01', now)).toEqual({ years: 6, months: 1 })
  })

  it('resta un mes cuando aún no se cumple el día del mes', () => {
    // Nació el 20; hoy es 14 → el mes en curso todavía no se ha cumplido.
    expect(calculateAge('2025-01-20', now)).toEqual({ years: 1, months: 4 })
  })

  it('da 0 años para un bebé de meses', () => {
    expect(calculateAge('2025-12-01', now)).toEqual({ years: 0, months: 6 })
  })

  it('da 0/0 el mismo día de nacimiento', () => {
    expect(calculateAge('2026-06-14', now)).toEqual({ years: 0, months: 0 })
  })
})

describe('formatAge', () => {
  it('usa solo meses para menores de un año', () => {
    expect(formatAge('2025-12-01', now)).toBe('6 meses')
  })

  it('singulariza un año / un mes', () => {
    expect(formatAge('2025-05-01', now)).toBe('1 año y 1 mes')
  })

  it('omite los meses cuando son cero', () => {
    expect(formatAge('2023-06-14', now)).toBe('3 años')
  })

  it('combina años y meses', () => {
    expect(formatAge('2020-05-01', now)).toBe('6 años y 1 mes')
  })
})
