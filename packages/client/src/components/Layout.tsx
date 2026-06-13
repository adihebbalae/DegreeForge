import { Routes, Route } from 'react-router-dom'
import Header from './Header'
import HomeRoute from './HomeRoute'
import PlannerPage from '../pages/PlannerPage'
import SchedulerPage from '../pages/SchedulerPage'
import SettingsPage from '../pages/SettingsPage'
import CareerPage from '../pages/CareerPage'
import { RecoverableErrorBoundary } from './PlannerErrorBoundary'

export default function Layout() {
  return (
    <div className="h-[100dvh] overflow-hidden bg-background text-foreground flex flex-col">
      <Header />
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
