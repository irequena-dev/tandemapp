import * as Popover from '@radix-ui/react-popover'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

type DateFieldProps = {
  id?: string
  /** Valor en ISO `yyyy-mm-dd`, o '' si no hay fecha. */
  value: string
  onChange: (iso: string) => void
  /** Fecha máxima seleccionable (ISO); días posteriores quedan deshabilitados. */
  max?: string
  invalid?: boolean
  describedBy?: string
}

const MONTHS_FULL = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
]
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // semana en lunes

const pad = (n: number) => String(n).padStart(2, '0')
const toISO = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`

function parseISO(iso: string): { y: number; m0: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return { y: Number(m[1]), m0: Number(m[2]) - 1, d: Number(m[3]) }
}

function todayISO(): string {
  const t = new Date()
  return toISO(t.getFullYear(), t.getMonth(), t.getDate())
}

function formatLong(iso: string): string {
  const p = parseISO(iso)
  if (!p) return ''
  return `${p.d} de ${MONTHS_FULL[p.m0]} de ${p.y}`
}

const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate()
/** Índice de columna (0 = lunes) del día 1 del mes. */
const firstColumn = (y: number, m0: number) => (new Date(y, m0, 1).getDay() + 6) % 7

const clampISO = (iso: string, maxIso?: string) =>
  maxIso && iso > maxIso ? maxIso : iso

type Mode = 'days' | 'months' | 'years'

/**
 * Selector de fecha bespoke: campo estilado con tokens que abre un calendario
 * propio en un Popover de Radix (portalizado, así escapa del `overflow:hidden`
 * de la lista). Navegación en cascada día → mes → año (ideal para fechas de
 * nacimiento) y teclado completo en la rejilla de días. El popup nativo del SO
 * no es estilable; por eso lo sustituimos por uno acorde a la app.
 */
export function DateField({
  id,
  value,
  onChange,
  max = todayISO(),
  invalid,
  describedBy,
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('days')

  const selected = parseISO(value)
  const maxP = parseISO(max)!
  const initial = selected ?? { y: maxP.y, m0: maxP.m0, d: maxP.d }

  const [viewY, setViewY] = useState(initial.y)
  const [viewM, setViewM] = useState(initial.m0)
  // Día con foco de teclado dentro de la rejilla (ISO).
  const [focusISO, setFocusISO] = useState(value || clampISO(todayISO(), max))

  const gridRef = useRef<HTMLDivElement>(null)

  // Al abrir: reinicia la vista al valor (o al máximo) y prepara el día activo.
  // Imperativo en `onOpenChange` (no en un efecto) para no encadenar renders.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const base = selected ?? { y: maxP.y, m0: maxP.m0 }
      setViewY(base.y)
      setViewM(base.m0)
      setMode('days')
      setFocusISO(value || clampISO(todayISO(), max))
    }
    setOpen(next)
  }

  // Mantiene el foco del DOM sobre el día enfocado por teclado.
  useEffect(() => {
    if (!open || mode !== 'days') return
    const el = gridRef.current?.querySelector<HTMLButtonElement>(
      `[data-date="${focusISO}"]`,
    )
    el?.focus()
  }, [focusISO, open, mode])

  const select = (iso: string) => {
    onChange(iso)
    setOpen(false)
  }

  const moveFocus = (deltaDays: number) => {
    const p = parseISO(focusISO)!
    const d = new Date(p.y, p.m0, p.d + deltaDays)
    const iso = toISO(d.getFullYear(), d.getMonth(), d.getDate())
    if (iso > max) return
    setViewY(d.getFullYear())
    setViewM(d.getMonth())
    setFocusISO(iso)
  }

  const onGridKeyDown = (e: KeyboardEvent) => {
    const map: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7,
    }
    if (e.key in map) {
      e.preventDefault()
      moveFocus(map[e.key])
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      moveFocus(-daysInMonth(viewY, viewM))
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      moveFocus(daysInMonth(viewY, viewM))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (focusISO <= max) select(focusISO)
    }
  }

  const goMonth = (delta: number) => {
    const d = new Date(viewY, viewM + delta, 1)
    setViewY(d.getFullYear())
    setViewM(d.getMonth())
  }

  // ---- rejillas ----
  const cells: (number | null)[] = []
  for (let i = 0; i < firstColumn(viewY, viewM); i++) cells.push(null)
  for (let d = 1; d <= daysInMonth(viewY, viewM); d++) cells.push(d)

  const decadeStart = Math.floor(viewY / 12) * 12

  const triggerLabel = value ? formatLong(value) : 'Elegir fecha'

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          className={`field__input field__input--date date-trigger${value ? '' : ' date-trigger--empty'}`}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        >
          <span>{triggerLabel}</span>
          <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            strokeLinejoin="round" aria-hidden="true" className="date-trigger__icon"
          >
            <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
            <path d="M3 9h18M8 2.5v4M16 2.5v4" />
          </svg>
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="cal"
          sideOffset={6}
          align="start"
          aria-label="Calendario"
        >
          <div className="cal__head">
            <button
              type="button"
              className="cal__nav"
              aria-label={mode === 'years' ? 'Década anterior' : mode === 'months' ? 'Año anterior' : 'Mes anterior'}
              onClick={() => {
                if (mode === 'days') goMonth(-1)
                else if (mode === 'months') setViewY((y) => y - 1)
                else setViewY((y) => y - 12)
              }}
            >
              <Chevron dir="left" />
            </button>

            <button
              type="button"
              className="cal__caption"
              onClick={() =>
                setMode((m) => (m === 'days' ? 'months' : m === 'months' ? 'years' : 'days'))
              }
            >
              {mode === 'days' && `${MONTHS_FULL[viewM]} ${viewY}`}
              {mode === 'months' && `${viewY}`}
              {mode === 'years' && `${decadeStart} – ${decadeStart + 11}`}
            </button>

            <button
              type="button"
              className="cal__nav"
              aria-label={mode === 'years' ? 'Década siguiente' : mode === 'months' ? 'Año siguiente' : 'Mes siguiente'}
              disabled={
                mode === 'days'
                  ? viewY > maxP.y || (viewY === maxP.y && viewM >= maxP.m0)
                  : mode === 'months'
                    ? viewY >= maxP.y
                    : decadeStart + 12 > maxP.y
              }
              onClick={() => {
                if (mode === 'days') goMonth(1)
                else if (mode === 'months') setViewY((y) => y + 1)
                else setViewY((y) => y + 12)
              }}
            >
              <Chevron dir="right" />
            </button>
          </div>

          {mode === 'days' && (
            <>
              <div className="cal__weekdays" aria-hidden="true">
                {WEEKDAYS.map((w, i) => (
                  <span key={i} className="cal__weekday">{w}</span>
                ))}
              </div>
              <div
                className="cal__grid"
                ref={gridRef}
                role="grid"
                onKeyDown={onGridKeyDown}
              >
                {cells.map((d, i) => {
                  if (d === null) return <span key={`b${i}`} className="cal__blank" />
                  const iso = toISO(viewY, viewM, d)
                  const isSelected = iso === value
                  const isToday = iso === todayISO()
                  const isDisabled = iso > max
                  const isFocusTarget = iso === focusISO
                  return (
                    <button
                      key={iso}
                      type="button"
                      data-date={iso}
                      className={`cal__day${isSelected ? ' cal__day--selected' : ''}${isToday ? ' cal__day--today' : ''}`}
                      role="gridcell"
                      aria-label={formatLong(iso)}
                      aria-selected={isSelected}
                      aria-current={isToday ? 'date' : undefined}
                      tabIndex={isFocusTarget ? 0 : -1}
                      disabled={isDisabled}
                      onClick={() => select(iso)}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {mode === 'months' && (
            <div className="cal__picker">
              {MONTHS_SHORT.map((label, m0) => {
                const disabled = viewY > maxP.y || (viewY === maxP.y && m0 > maxP.m0)
                const isSel = selected?.y === viewY && selected?.m0 === m0
                return (
                  <button
                    key={m0}
                    type="button"
                    className={`cal__cell${isSel ? ' cal__cell--selected' : ''}`}
                    disabled={disabled}
                    onClick={() => {
                      setViewM(m0)
                      setMode('days')
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}

          {mode === 'years' && (
            <div className="cal__picker">
              {Array.from({ length: 12 }, (_, i) => decadeStart + i).map((y) => {
                const disabled = y > maxP.y
                const isSel = selected?.y === y
                return (
                  <button
                    key={y}
                    type="button"
                    className={`cal__cell${isSel ? ' cal__cell--selected' : ''}`}
                    disabled={disabled}
                    onClick={() => {
                      setViewY(y)
                      setMode('months')
                    }}
                  >
                    {y}
                  </button>
                )
              })}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      strokeLinejoin="round" aria-hidden="true"
    >
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  )
}
