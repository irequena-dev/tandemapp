import { useId } from 'react'
import { initialOf, toneIndex } from './avatar'
import { AVATAR_COLORS, type AvatarColor } from './types'

/** Etiquetas legibles de cada color (en español, para a11y). */
const COLOR_LABELS: Record<AvatarColor, string> = {
  clay: 'Arcilla',
  sage: 'Salvia',
  ochre: 'Ocre',
  terracotta: 'Terracota',
  olive: 'Oliva',
  rosewood: 'Palo rosa',
}

type AvatarColorPickerProps = {
  /** Nombre del Hijo para la preview de la inicial. */
  name: string
  value: AvatarColor | null
  onChange: (color: AvatarColor) => void
}

/**
 * Selector de color de avatar con preview del monograma (inicial + color).
 * Muestra la paleta acotada como botones circulares con un indicador de
 * selección. La preview actualiza en tiempo real.
 */
export function AvatarColorPicker({ name, value, onChange }: AvatarColorPickerProps) {
  const groupId = useId()
  const effectiveColor = value ?? AVATAR_COLORS[0]
  const tone = toneIndex(effectiveColor)

  return (
    <div className="color-picker" role="group" aria-labelledby={groupId}>
      <span className="field__label" id={groupId}>
        Color del avatar
      </span>
      <div className="color-picker__row">
        <span
          className="hijo-mono hijo-mono--lg"
          data-tone={tone}
          aria-hidden="true"
        >
          {initialOf(name || '?')}
        </span>
        <div className="color-picker__swatches" role="radiogroup" aria-label="Paleta de colores">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-swatch${value === color ? ' color-swatch--selected' : ''}`}
              data-tone={toneIndex(color)}
              aria-label={COLOR_LABELS[color]}
              aria-pressed={value === color}
              onClick={() => onChange(color)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
