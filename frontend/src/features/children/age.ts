/** Edad derivada de la fecha de nacimiento, en años y meses cumplidos. */
export type Age = { years: number; months: number }

/**
 * Calcula la edad (años y meses cumplidos) a partir de `birth_date` (ISO
 * `yyyy-mm-dd`). La edad se deriva siempre; nunca se persiste. `now` es
 * inyectable para hacer la lógica testeable de forma determinista.
 */
export function calculateAge(birthDate: string, now: Date = new Date()): Age {
  const birth = new Date(`${birthDate}T00:00:00`)

  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  if (now.getDate() < birth.getDate()) months -= 1
  if (months < 0) {
    years -= 1
    months += 12
  }
  return { years, months }
}

/**
 * Formatea la edad en español de forma compacta para la PWA:
 * `8 meses` (bebés < 1 año), `1 año`, `3 años`, `2 años y 4 meses`.
 */
export function formatAge(birthDate: string, now: Date = new Date()): string {
  const { years, months } = calculateAge(birthDate, now)
  const y = `${years} ${years === 1 ? 'año' : 'años'}`
  const m = `${months} ${months === 1 ? 'mes' : 'meses'}`

  if (years <= 0) return m
  if (months === 0) return y
  return `${y} y ${m}`
}
