import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { ProfileProvider } from './context/ProfileContext.tsx'
import { PlanProvider, SnapshotProvider } from './context/PlanContext.tsx'
import { SettingsProvider } from './context/SettingsContext.tsx'
import { TooltipProvider } from './components/ui/tooltip'
import { OnboardingWizard } from './components/OnboardingWizard.tsx'
import { UiProvider } from './context/UiContext.tsx'
import { initAnalytics } from './lib/analytics.ts'
import './index.css'

initAnalytics()

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
