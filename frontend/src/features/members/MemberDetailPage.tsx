import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useChildren } from '../children/api'
import { useMembers } from '../members/api'
import { PautasSection } from '../pautas/PautasSection'
import { usePautas } from '../pautas/api'
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

function ArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

export function MemberDetailPage() {
  const { memberId = '' } = useParams<{ memberId: string }>()
  const { data: members } = useMembers()
  const { data: children } = useChildren()
  const { data: pautas } = usePautas()
  const [activeTab, setActiveTab] = useState<'pautas' | 'visitas'>('pautas')

  const member = members?.find((m) => m.id === memberId)
  const name = member?.display_name ?? memberId

  return (
    <div className="hijo-detail">
      <Link to="/familia" className="hijo-detail__back"><ArrowLeft /> Familia</Link>

      {/* Summary card */}
      <div className="hijo-detail__summary">
        <span className="hijo-mono hijo-mono--lg" data-tone={toneOf(name)}>
          {initialOf(name)}
        </span>
        <div className="hijo-detail__summary-info">
          <div className="hijo-detail__summary-name">{name}</div>
        </div>
      </div>

      {/* Tabbed sub-nav */}
      <div className="hijo-detail__tabs" role="tablist" aria-label="Secciones del detalle">
        <button
          type="button"
          className="hijo-detail__tab"
          role="tab"
          aria-selected={activeTab === 'pautas'}
          aria-controls="panel-pautas"
          id="tab-pautas"
          onClick={() => setActiveTab('pautas')}
        >
          Pautas
        </button>
        <button
          type="button"
          className="hijo-detail__tab"
          role="tab"
          aria-selected={activeTab === 'visitas'}
          aria-controls="panel-visitas"
          id="tab-visitas"
          onClick={() => setActiveTab('visitas')}
        >
          Visitas
        </button>
      </div>

      {/* Pautas tab panel */}
      <div
        id="panel-pautas"
        className="hijo-detail__tab-panel"
        role="tabpanel"
        aria-labelledby="tab-pautas"
        aria-hidden={activeTab !== 'pautas'}
      >
        <PautasSection
          subjectId={memberId}
          subjectType="member"
          subjectName={name}
          pautas={pautas ?? []}
          visits={[]}
          children={children ?? []}
          members={members ?? []}
        />
      </div>

      {/* Visitas tab panel — placeholder hasta que HealthVisit.member_id exista */}
      <div
        id="panel-visitas"
        className="hijo-detail__tab-panel"
        role="tabpanel"
        aria-labelledby="tab-visitas"
        aria-hidden={activeTab !== 'visitas'}
      >
        <section className="hijo-detail__section">
          <div className="hijo-detail__section-header">
            <h2 className="hijo-detail__section-title">Visitas médicas</h2>
          </div>
          <div className="hijo-detail__empty">
            <p>Sin visitas médicas</p>
          </div>
        </section>
      </div>
    </div>
  )
}
