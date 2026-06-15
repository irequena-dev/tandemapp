import { useEffect, useState } from 'react'
import {
  OrganizationSwitcher,
  Show,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/react'
import { Link, NavLink, Route, Routes } from 'react-router'
import { Logo } from './components/Logo'
import { ChildrenPage } from './features/children/ChildrenPage'
import { McpTokenPanel } from './features/mcp-tokens/McpTokenPanel'
import { SignInPage } from './pages/SignInPage'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

type WhoAmI = {
  member_id: string | null
  family: { org_id: string; role: string | null; slug: string | null } | null
}

function Header() {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid var(--ds-border)',
      }}
    >
      <span style={{ color: 'var(--ds-primary)' }}>
        <Link to="/">
          <Logo size={26} withWordmark />
        </Link>
      </span>
      <nav className="app-nav">
        <NavLink to="/ajustes/hijos" className="app-nav__link">
          Hijos
        </NavLink>
        <NavLink to="/ajustes/token" className="app-nav__link">
          Token MCP
        </NavLink>
      </nav>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <OrganizationSwitcher hidePersonal />
        <UserButton />
      </div>
    </header>
  )
}

function SignedInHome() {
  const { user } = useUser()
  const { getToken } = useAuth()
  const [whoami, setWhoami] = useState<WhoAmI | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const token = await getToken()
        const resp = await fetch(`${API_URL}/whoami`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const data = (await resp.json()) as WhoAmI
        if (!cancelled) setWhoami(data)
      } catch (e) {
        if (!cancelled) setError(String(e))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [getToken])

  return (
    <main style={{ padding: '2rem 1.5rem' }}>
      <h1>Hola{user?.firstName ? `, ${user.firstName}` : ''}</h1>
      <p>Has iniciado sesión en Tándem.</p>

      <h2 style={{ marginTop: '1.5rem' }}>Identidad (vía backend /whoami)</h2>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {!whoami && !error && <p>Cargando…</p>}
      {whoami && (
        <ul>
          <li>Miembro: {whoami.member_id ?? '—'}</li>
          <li>
            Familia:{' '}
            {whoami.family
              ? `${whoami.family.slug ?? whoami.family.org_id} (rol: ${whoami.family.role ?? '—'})`
              : 'sin Familia activa — crea una con el selector de arriba'}
          </li>
        </ul>
      )}
    </main>
  )
}

function App() {
  return (
    <>
      <Show when="signed-out">
        <SignInPage />
      </Show>
      <Show when="signed-in">
        <Header />
        <Routes>
          <Route index element={<SignedInHome />} />
          <Route path="/ajustes/hijos" element={<ChildrenPage />} />
          <Route path="/ajustes/token" element={<McpTokenPanel />} />
        </Routes>
      </Show>
    </>
  )
}

export default App
