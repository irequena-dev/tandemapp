import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/fraunces'
import { ClerkProvider } from '@clerk/react'
import { esES } from '@clerk/localizations'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { createQueryClient } from './lib/queryClient'
import { registerPWA } from './lib/registerPWA'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

if (!PUBLISHABLE_KEY) {
  throw new Error('Falta VITE_CLERK_PUBLISHABLE_KEY en .env.local')
}

const queryClient = createQueryClient()

registerPWA()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      afterSignOutUrl="/"
      localization={esES}
      appearance={{
        variables: {
          fontFamily:
            "'Hanken Grotesk Variable', 'Hanken Grotesk', system-ui, sans-serif",
          borderRadius: '12px',
          colorPrimary: '#5c794f',
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>,
)
