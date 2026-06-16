import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { ProfileProvider, PROFILE_STORAGE_KEY } from './context/ProfileContext.tsx'
import { PlanProvider, SnapshotProvider } from './context/PlanContext.tsx'
import { SettingsProvider } from './context/SettingsContext.tsx'
import { TooltipProvider } from './components/ui/tooltip'
import { RecoverableErrorBoundary } from './components/PlannerErrorBoundary.tsx'
import { UiProvider } from './context/UiContext.tsx'
import { DemoSeedBootstrap } from './components/DemoSeedBootstrap.tsx'
import { PersistBanner } from './components/PersistBanner.tsx'
import { safeGetRaw } from './lib/persist.ts'
import { initAnalytics } from './lib/analytics.ts'
import './index.css'

initAnalytics()

// Detect first run BEFORE ProfileProvider mounts (and before it persists the
// key via its auto-persist useEffect). This is read once at module scope so
// it survives React StrictMode double-invoking the component. Routed through the
// guarded read so disabled storage can't throw here and blank the app at bootstrap.
const IS_FIRST_RUN = safeGetRaw(PROFILE_STORAGE_KEY) === null

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RecoverableErrorBoundary label="app">
      <BrowserRouter>
        <DataProvider>
          <ProfileProvider>
            <SettingsProvider>
              <PlanProvider>
                <DemoSeedBootstrap isFirstRun={IS_FIRST_RUN} />
                <SnapshotProvider>
                  <TooltipProvider>
                    <UiProvider>
                      <App />
                      <PersistBanner />
                    </UiProvider>
                  </TooltipProvider>
                </SnapshotProvider>
              </PlanProvider>
            </SettingsProvider>
          </ProfileProvider>
        </DataProvider>
      </BrowserRouter>
    </RecoverableErrorBoundary>
  </React.StrictMode>,
)
