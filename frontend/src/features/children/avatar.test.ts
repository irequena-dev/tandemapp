import { describe, expect, it } from 'vitest'
import { fallbackColor, initialOf, resolveColor, toneIndex } from './avatar'

describe('initialOf', () => {
  it('devuelve la primera letra en mayúscula', () => {
    expect(initialOf('mara')).toBe('M')
    expect(initialOf('  luna  ')).toBe('L')
  })

  it('devuelve ? para un nombre vacío', () => {
    expect(initialOf('')).toBe('?')
    expect(initialOf('   ')).toBe('?')
  })
})

describe('fallbackColor', () => {
  it('devuelve un color válido de la paleta', () => {
    const colors = new Set(['clay', 'sage', 'ochre', 'terracotta', 'olive', 'rosewood'])
    // Varios UUIDs deberían mapear a colores válidos.
    const ids = [
      '550e8400-e29b-41d4-a716-446655440000',
      '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      'abc12345-1234-1234-1234-123456789012',
    ]
    for (const id of ids) {
      expect(colors.has(fallbackColor(id))).toBe(true)
    }
  })

  it('es determinista para el mismo id', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(fallbackColor(id)).toBe(fallbackColor(id))
  })
})

describe('toneIndex', () => {
  it('mapea cada color a su índice', () => {
    expect(toneIndex('clay')).toBe(0)
    expect(toneIndex('sage')).toBe(1)
    expect(toneIndex('ochre')).toBe(2)
    expect(toneIndex('terracotta')).toBe(3)
    expect(toneIndex('olive')).toBe(4)
    expect(toneIndex('rosewood')).toBe(5)
  })
})

describe('resolveColor', () => {
  it('usa el color explícito cuando está presente', () => {
    expect(resolveColor('sage', 'any-id')).toBe('sage')
  })

  it('cae al fallback por id cuando avatar_color es null', () => {
    const id = '550e8400-e29b-41d4-a716-446655440000'
    expect(resolveColor(null, id)).toBe(fallbackColor(id))
  })

  it('cae al fallback por id cuando avatar_color es undefined', () => {
    const id = 'abc12345-1234-1234-1234-123456789012'
    expect(resolveColor(undefined, id)).toBe(fallbackColor(id))
  })
})
