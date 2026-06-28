import { Link } from 'react-router'
import { useChildrenWithMetrics } from '../children/api'
import { formatAge } from '../children/age'
import type { ChildWithMetrics } from '../children/types'
import { useMembers } from '../members/api'
import { useCurrentMemberId } from '../members/useCurrentMemberId'
import type { Member } from '../members/types'
import '../hijos-tab/hijos-tab.css'
import '../children/children.css'

function initialOf(name: string): string {
  return [...name.trim()][0]?.toUpperCase() ?? '?'
}

function toneOf(name: string): number {
  let h = 0
  for (const ch of name) h = (h + (ch.codePointAt(0) ?? 0)) % 6
  return h
}

function ChevronRight() {
  return (
    <svg className="hijo-card__chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function PeopleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" /><circle cx="9" cy="7" r="3.2" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.3A4 4 0 0 1 16 11" />
    </svg>
  )
}

function ChildCard({ child }: { child: ChildWithMetrics }) {
  return (
    <Link to={`/hijos/${child.id}`} className="hijo-card">
      <span className="hijo-card__avatar">
        <span className="hijo-mono hijo-mono--lg" data-tone={toneOf(child.name)}>
          {initialOf(child.name)}
        </span>
      </span>
      <div className="hijo-card__info">
        <span className="hijo-card__name">{child.name}</span>
        <span className="hijo-card__age ds-nums">{formatAge(child.birth_date)}</span>
        <div className="hijo-card__metrics">
          {child.current_height_cm != null && (
            <span className="hijo-card__metric">
              <span className="hijo-card__metric-value">{child.current_height_cm} cm</span>
              <span className="hijo-card__metric-label">Altura</span>
            </span>
          )}
          {child.current_weight_kg != null && (
            <span className="hijo-card__metric">
              <span className="hijo-card__metric-value">{child.current_weight_kg} kg</span>
              <span className="hijo-card__metric-label">Peso</span>
            </span>
          )}
          {child.current_talla_calzado != null && (
            <span className="hijo-card__metric">
              <span className="hijo-card__metric-value">{child.current_talla_calzado}</span>
              <span className="hijo-card__metric-label">Calzado</span>
            </span>
          )}
          {child.current_talla != null && (
            <span className="hijo-card__metric">
              <span className="hijo-card__metric-value">{child.current_talla}</span>
              <span className="hijo-card__metric-label">Talla</span>
            </span>
          )}
        </div>
      </div>
      <ChevronRight />
    </Link>
  )
}

function MemberCard({ member, isMe }: { member: Member; isMe: boolean }) {
  const name = member.display_name ?? member.id
  return (
    <Link to={`/miembros/${member.id}`} className="hijo-card">
      <span className="hijo-card__avatar">
        <span className="hijo-mono hijo-mono--lg" data-tone={toneOf(name)}>
          {initialOf(name)}
        </span>
      </span>
      <div className="hijo-card__info">
        <span className="hijo-card__name">
          {name}
          {isMe && <span className="hijo-card__badge">Tú</span>}
        </span>
      </div>
      <ChevronRight />
    </Link>
  )
}

export function FamiliaTabPage() {
  const { data: children, isPending: childrenPending, isError: childrenError } = useChildrenWithMetrics()
  const { data: members, isPending: membersPending } = useMembers()
  const meId = useCurrentMemberId()

  const hasChildren = !childrenError && !!children && children.length > 0
  const otherMembers = (members ?? []).filter((m) => m.id !== meId)

  if (childrenPending && membersPending) {
    return (
      <div className="hijos-tab" aria-labelledby="familia-tab-title">
        <h1 className="hijos-tab__title" id="familia-tab-title">Familia</h1>
        <p className="hijos-tab__empty-text">Cargando…</p>
      </div>
    )
  }

  return (
    <div className="hijos-tab" aria-labelledby="familia-tab-title">
      <h1 className="hijos-tab__title" id="familia-tab-title">Familia</h1>

      {/* Sección Hijos */}
      <section className="familia-section" aria-labelledby="familia-hijos-title">
        <h2 className="familia-section__title" id="familia-hijos-title">Hijos</h2>
        {hasChildren ? (
          <div className="hijos-tab__grid">
            {children!.map((child) => (
              <ChildCard key={child.id} child={child} />
            ))}
          </div>
        ) : (
          <div className="hijos-tab__empty">
            <span className="hijos-tab__empty-icon" aria-hidden="true"><PeopleIcon /></span>
            <p className="hijos-tab__empty-title">Aún no hay Hijos en la Familia</p>
            <p className="hijos-tab__empty-text">
              Ve a Ajustes para añadir a tu primer Hijo. Después podrás ver aquí sus medidas, tallas y visitas.
            </p>
          </div>
        )}
      </section>

      {/* Sección Miembros */}
      <section className="familia-section" aria-labelledby="familia-miembros-title">
        <h2 className="familia-section__title" id="familia-miembros-title">Miembros</h2>
        {otherMembers.length > 0 ? (
          <div className="hijos-tab__grid">
            {(members ?? []).map((m) => (
              <MemberCard key={m.id} member={m} isMe={m.id === meId} />
            ))}
          </div>
        ) : (
          <div className="hijos-tab__empty">
            <span className="hijos-tab__empty-icon" aria-hidden="true"><PeopleIcon /></span>
            <p className="hijos-tab__empty-title">Solo tú en la Familia</p>
            <p className="hijos-tab__empty-text">
              Invita a otros Miembros desde Ajustes para compartir la carga de la casa.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
