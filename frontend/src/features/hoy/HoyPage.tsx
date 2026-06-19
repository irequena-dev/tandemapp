import { useState } from 'react'
import { Link } from 'react-router'
import { useMarkDose, useMarkEventDone, useToday, useUndoDose, useUndoEvent } from './api'
import type { HeroItem, TimelineEntry, TodaySummary } from './types'
import './hoy.css'

/* ---------- Hero ---------- */

function HeroCalm() {
  return (
    <section className="hoy-hero" aria-label="Ahora">
      <span className="hoy-hero__eyebrow">Ahora</span>
      <div className="hoy-hero__calm">
        <svg className="hoy-hero__calm-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        Nada urgente ahora · todo en orden
      </div>
    </section>
  )
}

function HeroUrgent({ hero }: { hero: HeroItem }) {
  const markDose = useMarkDose()
  const undoDose = useUndoDose()
  const markEvent = useMarkEventDone()
  const undoEvent = useUndoEvent()
  const [lastAdminId, setLastAdminId] = useState<string | null>(null)
  const [eventDone, setEventDone] = useState(false)

  const handleAction = () => {
    if (hero.type === 'pauta_dose' && hero.pauta_id) {
      markDose.mutate(hero.pauta_id, {
        onSuccess: (admin) => setLastAdminId(admin.id),
      })
    } else if (hero.type === 'event' && hero.event_id) {
      markEvent.mutate(hero.event_id, { onSuccess: () => setEventDone(true) })
    }
  }

  const handleUndo = () => {
    if (hero.type === 'pauta_dose' && hero.pauta_id && lastAdminId) {
      undoDose.mutate(
        { pautaId: hero.pauta_id, adminId: lastAdminId },
        { onSuccess: () => setLastAdminId(null) },
      )
    } else if (hero.type === 'event' && hero.event_id) {
      undoEvent.mutate(hero.event_id, { onSuccess: () => setEventDone(false) })
    }
  }

  const canUndo =
    (hero.type === 'pauta_dose' && lastAdminId) ||
    (hero.type === 'event' && eventDone)
  const acting = markDose.isPending || markEvent.isPending

  return (
    <section className="hoy-hero hoy-hero--urgent" aria-label="Ahora">
      <span className="hoy-hero__eyebrow">Ahora</span>
      <h2 className="hoy-hero__heading">{hero.title}</h2>
      <p className="hoy-hero__context">{hero.subtitle}</p>
      <div className="hoy-hero__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          onClick={handleAction}
          disabled={acting}
        >
          {hero.action_label}
        </button>
        {canUndo && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleUndo}
            disabled={undoDose.isPending || undoEvent.isPending}
          >
            Deshacer
          </button>
        )}
      </div>
    </section>
  )
}

function HeroSection({ hero }: { hero: HeroItem | null }) {
  return hero ? <HeroUrgent hero={hero} /> : <HeroCalm />
}

/* ---------- Timeline ---------- */

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function statusLabel(s: string) {
  if (s === 'done') return <><CheckIcon /> Hecho</>
  if (s === 'upcoming') return <><ClockIcon /> Próxima</>
  return <><ClockIcon /> Pendiente</>
}

function TimelineSection({ entries }: { entries: TimelineEntry[] }) {
  if (entries.length === 0) return null

  return (
    <section>
      <h2 className="hoy-timeline__title">Hoy</h2>
      <div className="hoy-timeline">
        {entries.map((e, i) => (
          <div className="hoy-tl-item" key={e.administration_id ?? e.event_id ?? e.pauta_id ?? i}>
            <span className="hoy-tl-item__time ds-nums">{e.time}</span>
            <div className="hoy-tl-item__body">
              <span className="hoy-tl-item__label">{e.title}</span>
              {e.subtitle && <span className="hoy-tl-item__sub">{e.subtitle}</span>}
            </div>
            <span className={`hoy-tl-item__status hoy-tl-item__status--${e.status}`}>
              {statusLabel(e.status)}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------- Summary cards ---------- */

function SummaryCards({ summary }: { summary: TodaySummary }) {
  return (
    <div className="hoy-cards">
      <Link to="/compra" className="hoy-card">
        <span className="hoy-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
            <path d="M2.5 3h2.2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6" />
          </svg>
        </span>
        <span className="hoy-card__label">Compra</span>
        <span className="hoy-card__value">
          {summary.shopping_pending_count > 0
            ? `${summary.shopping_pending_count} por comprar`
            : 'Lista vacía'}
        </span>
      </Link>

      <Link to="/pautas" className="hoy-card">
        <span className="hoy-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12h4l2 5 4-12 2 7h6" />
          </svg>
        </span>
        <span className="hoy-card__label">Pautas</span>
        <span className="hoy-card__value">
          {summary.pautas_active_count} activa{summary.pautas_active_count !== 1 ? 's' : ''} · {summary.pautas_finished_count} finalizada{summary.pautas_finished_count !== 1 ? 's' : ''}
        </span>
      </Link>

      <Link to="/eventos" className="hoy-card">
        <span className="hoy-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <span className="hoy-card__label">Próxima cita</span>
        <span className="hoy-card__value">
          {summary.next_medical_event
            ? summary.next_medical_event.title
            : 'Sin citas próximas'}
        </span>
      </Link>

      <Link to="/hijos" className="hoy-card">
        <span className="hoy-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="3.2" />
            <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.3A4 4 0 0 1 16 11" />
          </svg>
        </span>
        <span className="hoy-card__label">Hijos</span>
        <span className="hoy-card__value">Al día</span>
      </Link>
    </div>
  )
}

/* ---------- Page ---------- */

export function HoyPage() {
  const { data, isLoading, isError } = useToday()

  if (isLoading) {
    return (
      <div className="hoy" aria-labelledby="hoy-title">
        <h1 className="hoy__title" id="hoy-title">Hoy</h1>
        <p className="hoy-hero__calm">Cargando…</p>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="hoy" aria-labelledby="hoy-title">
        <h1 className="hoy__title" id="hoy-title">Hoy</h1>
        <p className="hoy-hero__calm">No se pudo cargar la información.</p>
      </div>
    )
  }

  return (
    <div className="hoy" aria-labelledby="hoy-title">
      <h1 className="hoy__title" id="hoy-title">Hoy</h1>
      <HeroSection hero={data.hero} />
      <TimelineSection entries={data.timeline} />
      <SummaryCards summary={data.summary} />
    </div>
  )
}
