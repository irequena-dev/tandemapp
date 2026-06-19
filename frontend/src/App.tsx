import { useState } from 'react'
import { Show } from '@clerk/react'
import { Route, Routes } from 'react-router'
import { useTheme } from './features/ajustes/useTheme'
import { Shell } from './features/shell/Shell'
import { HoyPage } from './features/hoy/HoyPage'
import { CompraPage } from './features/compra/CompraPage'
import { EventosPage } from './features/eventos/EventosPage'
import { HijosTabPage } from './features/hijos-tab/HijosTabPage'
import { HijoDetailPage } from './features/hijos-tab/HijoDetailPage'
import { PautasPage } from './features/pautas/PautasPage'
import { AjustesOverlay } from './features/ajustes/AjustesOverlay'
import { DisplayNameOverlay } from './features/members/DisplayNameOverlay'
import { useDisplayNamePrompt } from './features/members/useDisplayNamePrompt'
import { SignInPage } from './pages/SignInPage'
import { useAutoActivateOrganization } from './lib/useAutoActivateOrganization'

function App() {
  const [ajustesOpen, setAjustesOpen] = useState(false)
  const { shouldPrompt: shouldShowDisplayNamePrompt, dismiss: dismissDisplayNamePrompt } = useDisplayNamePrompt()
  useAutoActivateOrganization()
  useTheme() // apply persisted theme on mount

  return (
    <>
      <Show when="signed-out">
        <SignInPage />
      </Show>
      <Show when="signed-in">
        <Routes>
          <Route element={<Shell onOpenSettings={() => setAjustesOpen(true)} />}>
            <Route index element={<HoyPage />} />
            <Route path="/compra" element={<CompraPage />} />
            <Route path="/eventos" element={<EventosPage />} />
            <Route path="/hijos" element={<HijosTabPage />} />
            <Route path="/hijos/:childId" element={<HijoDetailPage />} />
            <Route path="/pautas" element={<PautasPage />} />
          </Route>
        </Routes>
        {ajustesOpen && <AjustesOverlay onClose={() => setAjustesOpen(false)} />}
        {shouldShowDisplayNamePrompt && <DisplayNameOverlay onClose={dismissDisplayNamePrompt} />}
      </Show>
    </>
  )
}

export default App
