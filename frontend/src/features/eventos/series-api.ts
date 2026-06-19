import { useAuth } from '@clerk/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '../../lib/api'
import { eventsKeys } from './events-api'
import type { SeriesCreate, SeriesCreatedOut } from './types'

/** Claves de caché de Series. */
export const seriesKeys = {
  all: ['series'] as const,
}

/* ---------- Preview de ocurrencias (espejo del backend) ---------- */

/** weekday estilo Python (lun=0…dom=6) a partir de un Date de JS (dom=0…sáb=6). */
function pyWeekday(d: Date): number {
  return (d.getDay() + 6) % 7
}

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

/** Suma `months` a `anchor` conservando su día de mes (con clamp a fin de mes). */
function addMonths(anchor: Date, months: number): Date {
  const baseMonth = anchor.getMonth() + months
  const year = anchor.getFullYear() + Math.floor(baseMonth / 12)
  const month = ((baseMonth % 12) + 12) % 12
  const lastDay = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(anchor.getDate(), lastDay))
}

/**
 * Preview de las ocurrencias que materializará una Serie (espejo del backend).
 * Devuelve las fechas YYYY-MM-DD acotadas por `ends_at` (incluida) o `max_count`.
 * Sin cota (`ends_at` y `max_count` ambos ausentes) → lista vacía.
 */
export function computeOccurrences(input: {
  cadence: SeriesCreate['cadence']
  day_of_week?: number | null
  starts_at: string
  ends_at?: string | null
  max_count?: number | null
}): string[] {
  const { cadence, day_of_week, starts_at, ends_at, max_count } = input
  const end = ends_at ? toDate(ends_at) : null
  if (end === null && max_count == null) return []

  const stepDays = cadence === 'weekly' ? 7 : cadence === 'biweekly' ? 14 : 0
  const starts = toDate(starts_at)
  const first =
    cadence === 'monthly'
      ? starts
      : addDays(starts, (((day_of_week ?? 0) - pyWeekday(starts)) % 7 + 7) % 7)

  const occurrences: string[] = []
  let index = 0
  for (;;) {
    const occ =
      cadence === 'monthly'
        ? addMonths(starts, index)
        : addDays(first, stepDays * index)
    if (end && occ > end) break
    if (max_count != null && occurrences.length >= max_count) break
    occurrences.push(toISO(occ))
    index += 1
  }
  return occurrences
}

/* ---------- Mutations ---------- */

/** Crea una Serie acotada y materializa sus ocurrencias como Eventos. */
export function useCreateSeries() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SeriesCreate) =>
      apiFetch<SeriesCreatedOut>('/api/series', {
        method: 'POST',
        token: await getToken(),
        body: input,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: eventsKeys.all })
    },
  })
}

/** Borra las ocurrencias futuras de una Serie (conserva pasadas/marcadas). */
export function useDeleteSeriesFuture() {
  const { getToken } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (seriesId: string) =>
      apiFetch<void>(`/api/series/${seriesId}/future`, {
        method: 'DELETE',
        token: await getToken(),
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: eventsKeys.all })
    },
  })
}
