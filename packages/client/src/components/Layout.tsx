import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Header from './Header'
import HomeRoute from './HomeRoute'
import PlannerPage from '../pages/PlannerPage'
import SettingsPage from '../pages/SettingsPage'
import ProgressPage from '../pages/ProgressPage'
import { RecoverableErrorBoundary } from './PlannerErrorBoundary'
import { useHomeVariant } from '../hooks/useHomeVariant'
import { useStuckPointerEventsGuard } from '../hooks/useStuckPointerEventsGuard'

export default function Layout() {
  const location = useLocation()
  const variant = useHomeVariant()
  // BUG 1 safeguard: recover from any orphaned Radix `pointer-events: none` lock
  // that would otherwise freeze the whole page (TASK-080).
  useStuckPointerEventsGuard()
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
          {/* Schedule + Career disabled for alpha launch — components retained; re-enable by restoring the nav link + route element. */}
          <Route path="/schedule" element={<Navigate to="/" replace />} />
          <Route path="/career" element={<Navigate to="/" replace />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/progress" element={<ProgressPage />} />
        </Routes>
      </main>
    </div>
  )
}
