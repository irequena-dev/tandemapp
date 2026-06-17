import { Link } from 'react-router'
import {
  EVENTS,
  PAUTAS,
  SHOPPING_ITEMS,
  childById,
  eventTypeById,
} from '../../lib/mock-data'
import './hoy.css'

/* ---------- Helpers ---------- */

function nextDoseTime(pauta: typeof PAUTAS[number]): Date | null {
  if (pauta.status !== 'activa') return null
  const last = pauta.administraciones.at(-1)
  if (!last) return new Date(pauta.started_at)
  return new Date(new Date(last.given_at).getTime() + pauta.interval_hours * 3600_000)
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

/* ---------- Hero ---------- */

function HeroSection() {
  const activePautas = PAUTAS.filter((p) => p.status === 'activa')
  const now = new Date()

  let urgentPauta: typeof PAUTAS[number] | null = null
  let urgentDose: Date | null = null

  for (const p of activePautas) {
    const next = nextDoseTime(p)
    if (next && next <= new Date(now.getTime() + 30 * 60_000)) {
      if (!urgentDose || next < urgentDose) {
        urgentPauta = p
        urgentDose = next
      }
    }
  }

  if (urgentPauta && urgentDose) {
    const child = childById(urgentPauta.child_id)
    const dayOfTreatment = Math.ceil(
      (now.getTime() - new Date(urgentPauta.started_at).getTime()) / 86_400_000,
    )
    return (
      <section className="hoy-hero hoy-hero--urgent" aria-label="Ahora">
        <span className="hoy-hero__eyebrow">Ahora</span>
        <h2 className="hoy-hero__heading">
          {urgentPauta.medication} · {urgentPauta.dose}
        </h2>
        <p className="hoy-hero__context">
          {child?.name} · día {dayOfTreatment} de {urgentPauta.duration_days}
        </p>
        <div className="hoy-hero__actions">
          <button type="button" className="btn btn--primary btn--sm">
            Marcar toma
          </button>
          <button type="button" className="btn btn--secondary btn--sm">
            Deshacer
          </button>
        </div>
      </section>
    )
  }

  const todayEvents = EVENTS.filter(
    (e) => e.date === now.toISOString().slice(0, 10) && e.status === 'pending',
  )
  const nextEvent = todayEvents.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))[0]

  if (nextEvent) {
    const child = nextEvent.child_id ? childById(nextEvent.child_id) : null
    const evType = eventTypeById(nextEvent.event_type_id)
    return (
      <section className="hoy-hero hoy-hero--urgent" aria-label="Ahora">
        <span className="hoy-hero__eyebrow">Ahora</span>
        <h2 className="hoy-hero__heading">{nextEvent.title}</h2>
        <p className="hoy-hero__context">
          {nextEvent.time && `${nextEvent.time} · `}
          {evType?.name}
          {child && ` · ${child.name}`}
        </p>
        <div className="hoy-hero__actions">
          <button type="button" className="btn btn--primary btn--sm">
            Marcar hecho
          </button>
        </div>
      </section>
    )
  }

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

/* ---------- Timeline ---------- */

type TimelineEntry = {
  time: string
  label: string
  sub: string
  status: 'done' | 'pending' | 'due'
}

function buildTimeline(): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  const today = new Date().toISOString().slice(0, 10)

  for (const p of PAUTAS) {
    if (p.status !== 'activa') continue
    const child = childById(p.child_id)

    for (const adm of p.administraciones) {
      if (adm.given_at.slice(0, 10) !== today) continue
      entries.push({
        time: formatTime(new Date(adm.given_at)),
        label: `${p.medication} ${p.dose}`,
        sub: `${child?.name} · dada por ${adm.given_by}`,
        status: 'done',
      })
    }

    const next = nextDoseTime(p)
    if (next && next.toISOString().slice(0, 10) === today) {
      const isOverdue = next < new Date()
      entries.push({
        time: formatTime(next),
        label: `${p.medication} ${p.dose}`,
        sub: `${child?.name} · próxima toma`,
        status: isOverdue ? 'due' : 'pending',
      })
    }
  }

  const todayEvents = EVENTS.filter((e) => e.date === today)
  for (const ev of todayEvents) {
    const child = ev.child_id ? childById(ev.child_id) : null
    const evType = eventTypeById(ev.event_type_id)
    entries.push({
      time: ev.time ?? '—',
      label: ev.title,
      sub: [evType?.name, child?.name].filter(Boolean).join(' · '),
      status: ev.status === 'done' ? 'done' : ev.status === 'overdue' ? 'due' : 'pending',
    })
  }

  entries.sort((a, b) => a.time.localeCompare(b.time))
  return entries
}

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

function TimelineSection() {
  const entries = buildTimeline()

  if (entries.length === 0) return null

  return (
    <section>
      <h2 className="hoy-timeline__title">Hoy</h2>
      <div className="hoy-timeline">
        {entries.map((e, i) => (
          <div className="hoy-tl-item" key={i}>
            <span className="hoy-tl-item__time ds-nums">{e.time}</span>
            <div className="hoy-tl-item__body">
              <span className="hoy-tl-item__label">{e.label}</span>
              <span className="hoy-tl-item__sub">{e.sub}</span>
            </div>
            <span className={`hoy-tl-item__status hoy-tl-item__status--${e.status}`}>
              {e.status === 'done' && <><CheckIcon /> Hecho</>}
              {e.status === 'pending' && <><ClockIcon /> Pendiente</>}
              {e.status === 'due' && <><ClockIcon /> Vencida</>}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ---------- Summary cards ---------- */

function SummaryCards() {
  const pendingCount = SHOPPING_ITEMS.filter((i) => !i.is_bought).length
  const activePautas = PAUTAS.filter((p) => p.status === 'activa').length
  const finalizadas = PAUTAS.filter((p) => p.status === 'finalizada').length
  const nextMedical = EVENTS
    .filter((e) => e.event_type_id === 'et-medico' && e.status === 'pending')
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  const nextMedChild = nextMedical?.child_id ? childById(nextMedical.child_id) : null

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
          {pendingCount > 0 ? `${pendingCount} por comprar` : 'Lista vacía'}
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
          {activePautas} activa{activePautas !== 1 ? 's' : ''} · {finalizadas} finalizada{finalizadas !== 1 ? 's' : ''}
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
          {nextMedical
            ? `${nextMedChild?.name ?? ''} · ${new Date(nextMedical.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`
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
  return (
    <div className="hoy" aria-labelledby="hoy-title">
      <h1 className="hoy__title" id="hoy-title">Hoy</h1>
      <HeroSection />
      <TimelineSection />
      <SummaryCards />
    </div>
  )
}
