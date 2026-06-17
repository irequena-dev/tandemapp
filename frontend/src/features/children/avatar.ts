import { AVATAR_COLORS, type AvatarColor } from './types'

/** Inicial bien presentada (primer grafema, en mayúscula). */
export function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

/**
 * Tono determinista por `id` del Hijo (fallback cuando `avatar_color` es null).
 * Usa el UUID para generar un índice estable en la paleta (0–5).
 */
export function fallbackColor(id: string): AvatarColor {
  let h = 0
  for (const ch of id) h = (h + (ch.codePointAt(0) ?? 0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[h]
}

/** Índice numérico (data-tone) de un color de la paleta. */
export function toneIndex(color: AvatarColor): number {
  return AVATAR_COLORS.indexOf(color)
}

/** Resuelve el color efectivo de un Hijo (explícito o fallback por id). */
export function resolveColor(
  avatarColor: AvatarColor | null | undefined,
  id: string,
): AvatarColor {
  return avatarColor ?? fallbackColor(id)
}
