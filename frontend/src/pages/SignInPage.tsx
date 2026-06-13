import { SignIn, SignUp } from '@clerk/react'
import { type ComponentProps, useEffect, useState } from 'react'
import { Logo } from '../components/Logo'
import './SignInPage.css'

type Mode = 'sign-in' | 'sign-up'
type ClerkAppearance = NonNullable<ComponentProps<typeof SignIn>['appearance']>

/** Tracks the OS color scheme so the Clerk widget's themed variables follow it. */
function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return dark
}

const FONT = "'Inter Variable', 'Inter', system-ui, sans-serif"

/** Clerk appearance themed to DESIGN.md, recomputed per color scheme. */
function clerkAppearance(dark: boolean): ClerkAppearance {
  const t = dark
    ? {
        ink: '#ebeff2',
        muted: '#9299a1',
        border: '#2e343a',
        surface: '#1e252c',
        input: '#0e1217',
        primary: '#64a1ee',
        onPrimary: '#0b1b2e',
        danger: '#ef8a8a',
      }
    : {
        ink: '#1f2730',
        muted: '#5b646f',
        border: '#dbdee2',
        surface: '#edf0f4',
        input: '#ffffff',
        primary: '#00579a',
        onPrimary: '#ffffff',
        danger: '#c53637',
      }
  return {
    variables: {
      colorPrimary: t.primary,
      colorPrimaryForeground: t.onPrimary,
      colorBackground: 'transparent',
      colorForeground: t.ink,
      colorMutedForeground: t.muted,
      colorInput: t.input,
      colorInputForeground: t.ink,
      colorBorder: t.border,
      colorDanger: t.danger,
      colorNeutral: t.ink,
      colorRing: t.primary,
      fontFamily: FONT,
      fontSize: '0.9375rem',
      borderRadius: '10px',
    },
    elements: {
      rootBox: { width: '100%' },
      cardBox: { width: '100%', boxShadow: 'none', border: 'none' },
      card: {
        boxShadow: 'none',
        border: 'none',
        background: 'transparent',
        padding: '0',
        gap: '1rem',
      },
      header: { display: 'none' },
      footer: { display: 'none' },
      socialButtonsBlockButton: {
        backgroundColor: t.surface,
        borderColor: t.border,
        color: t.ink,
        minHeight: '48px',
        '&:hover': {
          backgroundColor: `color-mix(in srgb, ${t.surface}, ${t.ink} 7%)`,
        },
      },
      formFieldInput: { minHeight: '48px', borderColor: t.border },
      formButtonPrimary: {
        minHeight: '48px',
        fontWeight: 600,
        textTransform: 'none',
        boxShadow: 'none',
        letterSpacing: 'normal',
      },
      formFieldLabel: { fontWeight: 500 },
      dividerLine: { background: t.border },
    },
  }
}

const FEATURES = [
  {
    title: 'Compra',
    text: 'Una lista compartida, siempre al día.',
    icon: (
      <>
        <circle cx="8" cy="21" r="1" />
        <circle cx="19" cy="21" r="1" />
        <path d="M2.5 3h2.2l2.4 12.4a2 2 0 0 0 2 1.6h8.2a2 2 0 0 0 2-1.6L21 7H6" />
      </>
    ),
  },
  {
    title: 'Tallas',
    text: 'La talla que le vale ahora a cada hijo.',
    icon: (
      <>
        <path d="M3 8v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z" />
        <path d="M7 6v3M11 6v4M15 6v3M19 6v4" />
      </>
    ),
  },
  {
    title: 'Salud',
    text: 'Pautas y próximas tomas, sin perder el hilo.',
    icon: (
      <>
        <path d="M3 12h4l2 5 4-12 2 7h6" />
      </>
    ),
  },
  {
    title: 'Agenda',
    text: 'Citas, cole y trámites, a la vista.',
    icon: (
      <>
        <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
        <path d="M3 9h18M8 2.5v4M16 2.5v4" />
      </>
    ),
  },
]

export function SignInPage() {
  const dark = usePrefersDark()
  const [mode, setMode] = useState<Mode>('sign-in')
  const appearance = clerkAppearance(dark)
  const isSignIn = mode === 'sign-in'

  return (
    <div className="auth">
      <aside className="auth__brand">
        <div className="auth__brand-inner">
          <Logo size={32} withWordmark className="auth__brand-logo" />
          <div className="auth__pitch">
            <h1 className="auth__pitch-title">
              Comparte la carga mental de la crianza.
            </h1>
            <p className="auth__pitch-sub">
              Tándem reúne la compra, las tallas, la salud y la agenda de tu
              familia en un solo lugar tranquilo. Dictas por voz, consultas de un
              vistazo.
            </p>
          </div>
          <ul className="auth__features">
            {FEATURES.map((f) => (
              <li key={f.title} className="auth__feature">
                <span className="auth__feature-icon" aria-hidden="true">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {f.icon}
                  </svg>
                </span>
                <span className="auth__feature-text">
                  <strong>{f.title}</strong>
                  {f.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="auth__panel">
        <div className="auth__card">
          <header className="auth__head">
            <Logo size={30} withWordmark className="auth__head-logo" />
            <h2 className="auth__title">
              {isSignIn ? 'Hola de nuevo' : 'Crea tu familia en Tándem'}
            </h2>
            <p className="auth__subtitle">
              {isSignIn
                ? 'Inicia sesión para continuar.'
                : 'Empieza a compartir la carga en un minuto.'}
            </p>
          </header>

          <div className="auth__widget">
            {isSignIn ? (
              <SignIn routing="hash" appearance={appearance} />
            ) : (
              <SignUp routing="hash" appearance={appearance} />
            )}
          </div>

          <p className="auth__switch">
            {isSignIn ? '¿Aún no tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <button
              type="button"
              className="auth__switch-btn"
              onClick={() => setMode(isSignIn ? 'sign-up' : 'sign-in')}
            >
              {isSignIn ? 'Crea una' : 'Inicia sesión'}
            </button>
          </p>
        </div>

        <p className="auth__legal">
          Tus datos quedan aislados por familia. Al continuar aceptas los
          Términos y la Política de privacidad de Tándem.
        </p>
      </main>
    </div>
  )
}
