import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { PlanProvider, SnapshotProvider } from './context/PlanContext.tsx'
import { SettingsProvider, useSettings } from './context/SettingsContext.tsx'
import { usePlanDispatch } from './context/PlanContext.tsx'
import { TooltipProvider } from './components/ui/tooltip'
import { OnboardingWizard } from './components/OnboardingWizard.tsx'
import { UiProvider } from './context/UiContext.tsx'
import './index.css'

// ─── One-way sync: Settings → PlanContext ────────────────────────────────────
// When techCoreId or mathBAToggle change in SettingsContext, mirror them into
// PlanContext's whatIf state so the planner palette and solver stay in sync.
// This must live INSIDE both providers.
function SettingsToPlanSync() {
  const { techCoreId, mathBAToggle } = useSettings()
  const planDispatch = usePlanDispatch()

  useEffect(() => {
    planDispatch({ type: 'SET_TECH_CORE', techCoreId })
  }, [techCoreId, planDispatch])

  useEffect(() => {
    planDispatch({ type: 'TOGGLE_MATH_BA', enabled: mathBAToggle })
  }, [mathBAToggle, planDispatch])

  return null
}

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
        <SettingsProvider>
          <PlanProvider>
            <SnapshotProvider>
              <SettingsToPlanSync />
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
      </DataProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
