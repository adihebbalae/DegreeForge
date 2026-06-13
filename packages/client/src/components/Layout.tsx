import { Routes, Route, useLocation } from 'react-router-dom'
import Header from './Header'
import HomeRoute from './HomeRoute'
import PlannerPage from '../pages/PlannerPage'
import SchedulerPage from '../pages/SchedulerPage'
import SettingsPage from '../pages/SettingsPage'
import CareerPage from '../pages/CareerPage'
import { RecoverableErrorBoundary } from './PlannerErrorBoundary'
import { useHomeVariant } from '../hooks/useHomeVariant'

export default function Layout() {
  const location = useLocation()
  const variant = useHomeVariant()
  // The minimalist-shell variant renders its own thin top bar, so on the home
  // route ("/") it must not stack under the global Header + OptimizeStrip. Every
  // other route and every other variant keep the global chrome.
  const useOwnChrome = location.pathname === '/' && variant === 'minimalist-shell'

  return (
    <div className="h-[100dvh] overflow-hidden bg-background text-foreground flex flex-col">
      {!useOwnChrome && <Header />}
      <main className="flex-1 min-h-0 overflow-hidden">
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/plan" element={<PlannerPage />} />
          <Route path="/schedule" element={
            <RecoverableErrorBoundary label="scheduler page">
              <SchedulerPage />
            </RecoverableErrorBoundary>
          } />
          <Route path="/career" element={
            <RecoverableErrorBoundary label="career page">
              <CareerPage />
            </RecoverableErrorBoundary>
          } />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
