import { useEffect, useState, useRef, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Moon, Sun, Download, Upload, RotateCcw, Undo2, Redo2, MessageSquare, Zap, Wand2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Notice } from '@/components/ui/notice'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { usePlanContext, usePlanDispatch, useCanUndo, useCanRedo } from '@/context/PlanContext'
import { useUi } from '@/context/UiContext'
import { useRecommendPlan } from '@/hooks/useRecommendPlan'
import { parsePlanState } from '@/lib/plan-schema'
import { parseProfileState } from '@/lib/profile-schema'
import { useOwnedProfile, useProfileDispatch } from '@/context/ProfileContext'
import type { UserProfile } from '@/types'
import SemesterTransitionDialog from './SemesterTransitionDialog'

// ─── Export bundle versioning ─────────────────────────────────────────────────
// v1: plan-only (legacy, no version field)
// v2: { version: 2, plan: PlanState, profile: UserProfile }

interface ExportBundleV2 {
  version: 2;
  plan: ReturnType<typeof JSON.parse>;
  profile: UserProfile;
}

export default function Header() {
  const { state } = usePlanContext()
  const dispatch = usePlanDispatch()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  const profile = useOwnedProfile()
  const profileDispatch = useProfileDispatch()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [transitionOpen, setTransitionOpen] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)

  const location = useLocation()
  const isPlannerRoute = location.pathname === '/'
  const { chatOpen, setChatOpen, whatIfOpen, setWhatIfOpen } = useUi()
  const { handleRecommendPlan, noticeProps, confirmProps } = useRecommendPlan()

  const [dark, setDark] = useState<boolean>(() => {
    const stored = localStorage.getItem('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [dark])

  // Live-compute how many planned (non-past) courses will be removed by a reset
  const plannedCourseCount = useMemo(() => {
    return state.semesters
      .filter(s => s.status !== 'past')
      .reduce((sum, s) => sum + (state.plan[s.id]?.length ?? 0), 0)
  }, [state.semesters, state.plan])

  const handleExport = () => {
    // v2 bundle: wraps plan + profile together with a version discriminant.
    // Old plan-only files (no version field) are treated as v1 on import.
    const bundle: ExportBundleV2 = { version: 2, plan: state, profile }
    const dataStr = JSON.stringify(bundle, null, 2)
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)
    const exportFileDefaultName = `degreeforge-plan-${new Date().toISOString().split('T')[0]}.json`

    const linkElement = document.createElement('a')
    linkElement.setAttribute('href', dataUri)
    linkElement.setAttribute('download', exportFileDefaultName)
    linkElement.click()
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const raw = JSON.parse(content) as Record<string, unknown>

        // Detect v2 bundle ({ version: 2, plan: ..., profile: ... }) vs
        // legacy v1 plan-only file (no version field).
        const isV2Bundle = raw.version === 2 && raw.plan !== undefined

        const planRaw = isV2Bundle ? raw.plan : raw
        const validated = parsePlanState(planRaw)

        if (!validated) {
          setImportError('invalid-format')
          return
        }

        dispatch({ type: 'SET_FULL_STATE', state: validated })

        // If a v2 bundle, attempt to restore the profile. A malformed profile
        // is non-fatal: skip and keep the plan import.
        if (isV2Bundle && raw.profile !== undefined) {
          const validatedProfile = parseProfileState(raw.profile)
          if (validatedProfile) {
            profileDispatch({ type: 'SET_PROFILE', profile: validatedProfile })
          }
          // If validatedProfile is null, the profile was malformed — silently skip.
          // The plan still imported successfully.
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Import failed to parse JSON:', msg)
        setImportError('parse-failed')
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be uploaded again if needed
    event.target.value = ''
  }

  const handleReset = () => {
    setResetConfirmOpen(true)
  }

  const nonPastSemCount = state.semesters.filter(s => s.status !== 'past').length

  return (
    <>
      <header className="h-14 border-b border-border flex items-center px-4 gap-2 bg-background">
        {/* Logo / wordmark */}
        <span className="text-lg font-bold text-foreground select-none mr-2">DegreeForge</span>

        {/* Nav links (centered) */}
        <nav className="flex gap-1 flex-1 justify-center">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost' }),
                isActive && 'underline underline-offset-4 font-semibold',
              )
            }
          >
            Planner
          </NavLink>
          <NavLink
            to="/schedule"
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost' }),
                isActive && 'underline underline-offset-4 font-semibold',
              )
            }
          >
            Schedule
          </NavLink>
          <NavLink
            to="/career"
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost' }),
                isActive && 'underline underline-offset-4 font-semibold',
              )
            }
          >
            Career
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost' }),
                isActive && 'underline underline-offset-4 font-semibold',
              )
            }
          >
            Settings
          </NavLink>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {isPlannerRoute && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setWhatIfOpen(true)}
                title="Open What-If Simulator"
                className={whatIfOpen ? 'bg-accent text-accent-foreground' : ''}
              >
                <Zap className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(true)}
                title="Open AI Chat"
                className={chatOpen ? 'bg-accent text-accent-foreground' : ''}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRecommendPlan}
                title="Recommend 4-Year Plan"
              >
                <Wand2 className="h-4 w-4" />
              </Button>
              <div className="w-[1px] h-4 bg-border mx-1" />
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch({ type: 'UNDO' })}
            disabled={!canUndo}
            title="Undo"
            aria-label="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => dispatch({ type: 'REDO' })}
            disabled={!canRedo}
            title="Redo"
            aria-label="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="w-[1px] h-4 bg-border mx-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={handleExport}
            title="Export Plan (JSON)"
            aria-label="Export Plan"
          >
            <Download className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            title="Import Plan (JSON)"
            aria-label="Import Plan"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".json"
            onChange={handleImport}
          />

          <Button
            variant="ghost"
            size="icon"
            onClick={handleReset}
            title="Reset Plan"
            aria-label="Reset Plan"
            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="text-xs font-medium mr-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/50"
            onClick={() => setTransitionOpen(true)}
          >
            Advance Semester ▶
          </Button>

          <div className="w-px h-6 bg-border mx-1" />

          {/* Dark mode toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
        </div>

        <SemesterTransitionDialog open={transitionOpen} onOpenChange={setTransitionOpen} />
      </header>

      {importError && (
        <div className="px-4 py-2 border-b">
          <Notice
            variant="error"
            message={
              importError === 'invalid-format'
                ? 'The file does not contain a valid DegreeForge plan (missing semesters or plan fields).'
                : 'The file could not be parsed as JSON. Most common cause: file is corrupted or not a DegreeForge export.'
            }
            action={{ label: 'Open file again', onClick: () => { setImportError(null); fileInputRef.current?.click(); } }}
            onDismiss={() => setImportError(null)}
          />
        </div>
      )}

      {noticeProps && (
        <div className="px-4 py-2 border-b">
          <Notice {...noticeProps} />
        </div>
      )}

      {confirmProps && <ConfirmDialog {...confirmProps} />}

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset plan to initial state"
        consequence={`Removes ${plannedCourseCount} planned course${plannedCourseCount === 1 ? '' : 's'} across ${nonPastSemCount} semester${nonPastSemCount === 1 ? '' : 's'}. Completed courses are preserved.`}
        confirmLabel="Reset Plan"
        onConfirm={() => dispatch({ type: 'RESET_PLAN' })}
      />
    </>
  )
}
