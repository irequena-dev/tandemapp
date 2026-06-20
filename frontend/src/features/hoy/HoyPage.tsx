import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useMarkDose, useMarkEventDone, useToday, useUndoDose, useUndoEvent } from './api'
import type { HeroItem, TimelineEntry, TodaySummary } from './types'
import './hoy.css'

/* ---------- Hero ---------- */

function HeroCalm() {
  return (
    <section className="hoy-hero" aria-label="Ahora">
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

const HERO_UNDO_KEY = 'hoy:hero-undo'
const HERO_UNDO_WINDOW_MS = 10_000

type HeroUndoRecord =
  | { kind: 'dose'; pautaId: string; adminId: string; ts: number }
  | { kind: 'event'; eventId: string; ts: number }

function readHeroUndo(): HeroUndoRecord | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(HERO_UNDO_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as HeroUndoRecord
    if (Date.now() - parsed.ts >= HERO_UNDO_WINDOW_MS) {
      window.localStorage.removeItem(HERO_UNDO_KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeHeroUndo(record: HeroUndoRecord) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(HERO_UNDO_KEY, JSON.stringify(record))
  } catch {
    /* almacenamiento no disponible: la función de deshacer simplemente no persiste */
  }
}

function clearHeroUndo() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(HERO_UNDO_KEY)
  } catch {
    /* noop */
  }
}

function HeroUrgent({ hero }: { hero: HeroItem }) {
  const markDose = useMarkDose()
  const undoDose = useUndoDose()
  const markEvent = useMarkEventDone()
  const undoEvent = useUndoEvent()
  const [lastAdminId, setLastAdminId] = useState<string | null>(null)
  const [eventDone, setEventDone] = useState(false)
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restaurar la última acción si ocurrió hace < 10s (p. ej. tras recargar).
  useEffect(() => {
    const restored = readHeroUndo()
    if (!restored) return
    if (restored.kind === 'dose' && hero.type === 'pauta_dose' && hero.pauta_id === restored.pautaId) {
      setLastAdminId(restored.adminId)
    } else if (restored.kind === 'event' && hero.type === 'event' && hero.event_id === restored.eventId) {
      setEventDone(true)
    }
  }, [hero.event_id, hero.pauta_id, hero.type])

  // Auto-ocultar el "Deshacer" 10s después de actuar.
  useEffect(() => {
    return () => {
      if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
    }
  }, [])

  const armAutoHide = () => {
    if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
    autoHideTimer.current = setTimeout(() => {
      setLastAdminId(null)
      setEventDone(false)
      clearHeroUndo()
    }, HERO_UNDO_WINDOW_MS)
  }

  const handleAction = () => {
    if (hero.type === 'pauta_dose' && hero.pauta_id) {
      markDose.mutate(hero.pauta_id, {
        onSuccess: (admin) => {
          setLastAdminId(admin.id)
          writeHeroUndo({
            kind: 'dose',
            pautaId: hero.pauta_id!,
            adminId: admin.id,
            ts: Date.now(),
          })
          armAutoHide()
        },
      })
    } else if (hero.type === 'event' && hero.event_id) {
      markEvent.mutate(hero.event_id, {
        onSuccess: () => {
          setEventDone(true)
          writeHeroUndo({
            kind: 'event',
            eventId: hero.event_id!,
            ts: Date.now(),
          })
          armAutoHide()
        },
      })
    }
  }

  const handleUndo = () => {
    if (hero.type === 'pauta_dose' && hero.pauta_id && lastAdminId) {
      undoDose.mutate(
        { pautaId: hero.pauta_id, adminId: lastAdminId },
        {
          onSuccess: () => {
            setLastAdminId(null)
            clearHeroUndo()
            if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
          },
        },
      )
    } else if (hero.type === 'event' && hero.event_id) {
      undoEvent.mutate(hero.event_id, {
        onSuccess: () => {
          setEventDone(false)
          clearHeroUndo()
          if (autoHideTimer.current) clearTimeout(autoHideTimer.current)
        },
      })
    }
  }

  const canUndo =
    (hero.type === 'pauta_dose' && lastAdminId) ||
    (hero.type === 'event' && eventDone)
  const acting = markDose.isPending || markEvent.isPending

  return (
    <section className="hoy-hero hoy-hero--urgent" aria-label="Ahora">
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

function DotIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="6" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function statusLabel(s: string) {
  if (s === 'done') return <><CheckIcon /> Hecho</>
  if (s === 'upcoming') return <><ClockIcon /> Próxima</>
  if (s === 'pending') return <><DotIcon /> Pendiente</>
  if (s === 'due') return <><AlertIcon /> Vencida</>
  return <><DotIcon /> Pendiente</>
}

function TimelineSection({ entries }: { entries: TimelineEntry[] }) {
  return (
    <section>
      <h2 className="hoy-timeline__title">Agenda de hoy</h2>
      <div className="hoy-timeline">
        {entries.length === 0 ? (
          <p className="hoy-timeline__empty">Hoy está tranquilo — nada en la agenda.</p>
        ) : (
          entries.map((e, i) => {
            const to = e.pauta_id ? '/pautas' : '/eventos'
            const key = e.administration_id ?? e.event_id ?? e.pauta_id ?? i
            return (
              <Link to={to} className="hoy-tl-item hoy-tl-item--link" key={key}>
                <span className="hoy-tl-item__time ds-nums">{e.time}</span>
                <div className="hoy-tl-item__body">
                  <span className="hoy-tl-item__label hoy-clamp-2">{e.title}</span>
                  {e.subtitle && <span className="hoy-tl-item__sub hoy-clamp-1">{e.subtitle}</span>}
                </div>
                <span className={`hoy-tl-item__status hoy-tl-item__status--${e.status}`}>
                  {statusLabel(e.status)}
                </span>
              </Link>
            )
          })
        )}
      </div>
    </section>
  )
}

/* ---------- Summary cards ---------- */

type ChildStatusMeta = { label: string; icon: ReactNode; cls: string }

function childStatusMeta(status: TodaySummary['children_status']): ChildStatusMeta {
  switch (status) {
    case 'revision_vencida':
      return { label: 'Revisión vencida', icon: <AlertIcon />, cls: 'is-warn' }
    case 'seguimiento':
      return { label: 'Seguimiento', icon: <CalendarIcon />, cls: 'is-muted' }
    default:
      return { label: 'Al día', icon: <CheckIcon />, cls: 'is-ok' }
  }
}

function SummaryCards({ summary }: { summary: TodaySummary }) {
  const childMeta = childStatusMeta(summary.children_status)
  const compraAttn = summary.shopping_pending_count > 0
  return (
    <section className="hoy-summary" aria-label="Resumen">
      <Link
        to="/compra"
        className={`hoy-row hoy-row--compra${compraAttn ? ' is-attn' : ''}`}
      >
        <span className="hoy-row__icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" />
            <path d="M2.5 3h2.2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6" />
          </svg>
        </span>
        <span className="hoy-row__body">
          <span className="hoy-row__label">Compra</span>
          <span className="hoy-row__value">
            {compraAttn
              ? `${summary.shopping_pending_count} por comprar`
              : 'Lista vacía'}
          </span>
        </span>
        <span className="hoy-row__chevron" aria-hidden="true"><ChevronRightIcon /></span>
      </Link>

      <div className="hoy-summary__list">
        <Link to="/pautas" className="hoy-row">
          <span className="hoy-row__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h4l2 5 4-12 2 7h6" />
            </svg>
          </span>
          <span className="hoy-row__body">
            <span className="hoy-row__label">Pautas</span>
            <span className="hoy-row__value">
              {summary.pautas_active_count} activa{summary.pautas_active_count !== 1 ? 's' : ''} · {summary.pautas_finished_count} finalizada{summary.pautas_finished_count !== 1 ? 's' : ''}
            </span>
          </span>
          <span className="hoy-row__chevron" aria-hidden="true"><ChevronRightIcon /></span>
        </Link>

        <Link to="/eventos" className="hoy-row">
          <span className="hoy-row__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </span>
          <span className="hoy-row__body">
            <span className="hoy-row__label">Próxima cita</span>
            <span className="hoy-row__value hoy-clamp-2">
              {summary.next_medical_event
                ? summary.next_medical_event.title
                : 'Sin citas próximas'}
            </span>
          </span>
          <span className="hoy-row__chevron" aria-hidden="true"><ChevronRightIcon /></span>
        </Link>

        <Link to="/hijos" className="hoy-row">
          <span className="hoy-row__icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="3.2" />
              <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.3A4 4 0 0 1 16 11" />
            </svg>
          </span>
          <span className="hoy-row__body">
            <span className="hoy-row__label">Hijos</span>
            <span className={`hoy-row__value hoy-row__chip ${childMeta.cls}`}>
              <span className="hoy-card__statusicon" aria-hidden="true">{childMeta.icon}</span>
              {childMeta.label}
            </span>
          </span>
          <span className="hoy-row__chevron" aria-hidden="true"><ChevronRightIcon /></span>
        </Link>
      </div>
    </section>
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
