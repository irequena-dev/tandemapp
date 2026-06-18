/** Contrato de `GET /api/today` (§6 del api-contract.md). */

import type { EventOut } from '../eventos/types'

export type HeroItem = {
  type: 'pauta_dose' | 'event'
  title: string
  subtitle: string
  action_label: string
  pauta_id?: string
  event_id?: string
}

export type TimelineEntry = {
  type: 'dose_given' | 'dose_upcoming' | 'event'
  time: string
  title: string
  subtitle: string | null
  status: 'done' | 'upcoming' | 'pending'
  pauta_id?: string
  administration_id?: string
  event_id?: string
}

export type TodaySummary = {
  shopping_pending_count: number
  pautas_active_count: number
  pautas_finished_count: number
  next_medical_event: EventOut | null
  children_status: string
}

export type TodayOut = {
  hero: HeroItem | null
  timeline: TimelineEntry[]
  summary: TodaySummary
}
