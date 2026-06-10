import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { ProfileProvider, PROFILE_STORAGE_KEY } from './context/ProfileContext.tsx'
import { PlanProvider, SnapshotProvider } from './context/PlanContext.tsx'
import { SettingsProvider } from './context/SettingsContext.tsx'
import { TooltipProvider } from './components/ui/tooltip'
import { OnboardingWizard } from './components/OnboardingWizard.tsx'
import { UiProvider } from './context/UiContext.tsx'
import { DemoSeedBootstrap } from './components/DemoSeedBootstrap.tsx'
import { initAnalytics } from './lib/analytics.ts'
import './index.css'

initAnalytics()

// Detect first run BEFORE ProfileProvider mounts (and before it persists the
// key via its auto-persist useEffect). This is read once at module scope so
// it survives React StrictMode double-invoking the component.
const IS_FIRST_RUN = localStorage.getItem(PROFILE_STORAGE_KEY) === null

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [isOnboarded, setIsOnboarded] = React.useState(
    () => localStorage.getItem('degreeforge:onboarded') === 'true'
  )

  if (!isOnboarded) {
    return (
      <OnboardingWizard
        onComplete={() => {
          localStorage.setItem('degreeforge:onboarded', 'true')
          setIsOnboarded(true)
        }}
      />
    )
  }

  return <>{children}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DataProvider>
        <ProfileProvider>
          <SettingsProvider>
            <PlanProvider>
              <DemoSeedBootstrap isFirstRun={IS_FIRST_RUN} />
              <SnapshotProvider>
                <TooltipProvider>
                  <UiProvider>
                    <OnboardingGate>
                      <App />
                    </OnboardingGate>
                  </UiProvider>
                </TooltipProvider>
              </SnapshotProvider>
            </PlanProvider>
          </SettingsProvider>
        </ProfileProvider>
      </DataProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
