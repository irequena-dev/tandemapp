import '@fontsource-variable/inter'
import { ClerkProvider } from '@clerk/react'
import { esES } from '@clerk/localizations'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Falta VITE_CLERK_PUBLISHABLE_KEY en .env.local')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      localization={esES}
      appearance={{
        variables: {
          fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif",
          borderRadius: '10px',
          colorPrimary: '#00579a',
        },
      }}
    >
      <App />
    </ClerkProvider>
  </StrictMode>,
)
