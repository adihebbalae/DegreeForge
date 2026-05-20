import { Routes, Route } from 'react-router-dom'
import Header from './Header'
import PlannerPage from '../pages/PlannerPage'
import SchedulerPage from '../pages/SchedulerPage'
import SettingsPage from '../pages/SettingsPage'

export default function Layout() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <Header />
      <main className="flex-1 overflow-hidden" style={{ height: 'calc(100dvh - 56px)' }}>
        <Routes>
          <Route path="/" element={<PlannerPage />} />
          <Route path="/schedule" element={<SchedulerPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}
