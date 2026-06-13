import { useEffect, useState } from 'react'
import {
  OrganizationSwitcher,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
  useUser,
} from '@clerk/react'

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
        padding: '1rem 1.5rem',
        borderBottom: '1px solid #e5e7eb',
      }}
    >
      <strong style={{ fontSize: '1.25rem' }}>Tándem</strong>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Show when="signed-out">
          <SignInButton mode="modal" />
          <SignUpButton mode="modal" />
        </Show>
        <Show when="signed-in">
          <OrganizationSwitcher hidePersonal />
          <UserButton />
        </Show>
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
      <Header />
      <Show when="signed-out">
        <main style={{ padding: '2rem 1.5rem' }}>
          <h1>Tándem</h1>
          <p>Inicia sesión o crea una cuenta para empezar.</p>
        </main>
      </Show>
      <Show when="signed-in">
        <SignedInHome />
      </Show>
    </>
  )
}

export default App
