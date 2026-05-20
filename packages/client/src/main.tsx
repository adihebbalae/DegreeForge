import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { PlanProvider } from './context/PlanContext.tsx'
import { SettingsProvider, useSettings } from './context/SettingsContext.tsx'
import { usePlanDispatch } from './context/PlanContext.tsx'
import { TooltipProvider } from './components/ui/tooltip'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DataProvider>
        <SettingsProvider>
          <PlanProvider>
            <SettingsToPlanSync />
            <TooltipProvider>
              <App />
            </TooltipProvider>
          </PlanProvider>
        </SettingsProvider>
      </DataProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
