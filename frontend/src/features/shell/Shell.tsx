import { Link, NavLink, Outlet } from 'react-router'
import { Logo } from '../../components/Logo'
import './shell.css'

function SettingsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/* Tab icon components — outline when inactive, filled path implied by CSS color */
function IconHoy() {
  return (
    <svg className="shell-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function IconCompra() {
  return (
    <svg className="shell-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="21" r="1" />
      <circle cx="19" cy="21" r="1" />
      <path d="M2.5 3h2.2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6" />
    </svg>
  )
}

function IconEventos() {
  return (
    <svg className="shell-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

function IconHijos() {
  return (
    <svg className="shell-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
      <circle cx="9" cy="7" r="3.2" />
      <path d="M22 19v-1a4 4 0 0 0-3-3.87M16 3.3A4 4 0 0 1 16 11" />
    </svg>
  )
}

function IconPautas() {
  return (
    <svg className="shell-tab__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2 5 4-12 2 7h6" />
    </svg>
  )
}

const TABS = [
  { to: '/', label: 'Hoy', Icon: IconHoy, end: true },
  { to: '/compra', label: 'Compra', Icon: IconCompra, end: false },
  { to: '/eventos', label: 'Eventos', Icon: IconEventos, end: false },
  { to: '/familia', label: 'Familia', Icon: IconHijos, end: false },
  { to: '/pautas', label: 'Pautas', Icon: IconPautas, end: false },
] as const

export function Shell({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100svh' }}>
      <header className="shell-header">
        <Link to="/" className="shell-header__logo" aria-label="Tándem — Inicio">
          <Logo size={26} withWordmark />
        </Link>
        <button
          type="button"
          className="shell-header__settings"
          aria-label="Ajustes"
          onClick={onOpenSettings}
        >
          <SettingsIcon />
        </button>
      </header>

      <main className="shell-main">
        <Outlet />
      </main>

      <nav className="shell-tabs" aria-label="Navegación principal">
        {TABS.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => `shell-tab${isActive ? ' active' : ''}`}>
            <Icon />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
