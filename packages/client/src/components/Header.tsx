import { useEffect, useState, useRef, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Moon,
  Sun,
  Download,
  Upload,
  RotateCcw,
  Undo2,
  Redo2,
  MessageSquare,
  Zap,
  Wand2,
  MoreHorizontal,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Notice } from '@/components/ui/notice'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { usePlanContext, usePlanDispatch, useCanUndo, useCanRedo } from '@/context/PlanContext'
import { useUi } from '@/context/UiContext'
import { useRecommendPlan } from '@/hooks/useRecommendPlan'
import { parsePlanState } from '@/lib/plan-schema'
import { parseProfileState } from '@/lib/profile-schema'
import { sanitizePlan } from '@/lib/sanitize-course-list'
import { safeGetRaw, safeSetItem } from '@/lib/persist'
import { track } from '@/lib/analytics'
import { useOwnedProfile, useProfileDispatch } from '@/context/ProfileContext'
import type { UserProfile } from '@/types'
import SemesterTransitionDialog from './SemesterTransitionDialog'
import OptimizeStrip from './OptimizeStrip'
import { AI_ENABLED } from '@/lib/features'

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
  // Both the home route ("/") and the explicit "/plan" route render the planner,
  // so planner-only actions (optimize strip, what-if, chat, recommend) apply to both.
  const isPlannerRoute = location.pathname === '/' || location.pathname === '/plan'
  const { chatOpen, setChatOpen, whatIfOpen, setWhatIfOpen } = useUi()
  const { handleRecommendPlan, noticeProps, confirmProps } = useRecommendPlan()

  const [dark, setDark] = useState<boolean>(() => {
    const stored = safeGetRaw('theme')
    if (stored) return stored === 'dark'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
      safeSetItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      safeSetItem('theme', 'light')
    }
  }, [dark])

  // Live-compute how many planned (non-past) courses will be removed by a reset
  const plannedCourseCount = useMemo(() => {
    return state.semesters
      .filter(s => s.status !== 'past')
      .reduce((sum, s) => sum + (state.plan[s.id]?.length ?? 0), 0)
  }, [state.semesters, state.plan])

  // Reverse Semester is the inverse of Advance: it can only run when there's a
  // current term with a past term immediately before it to retreat into.
  const canReverse = useMemo(() => {
    const currentIdx = state.semesters.findIndex(s => s.status === 'current')
    if (currentIdx === -1) return false
    for (let i = currentIdx - 1; i >= 0; i--) {
      if (state.semesters[i].status === 'past') return true
    }
    return false
  }, [state.semesters])

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

    track('plan_exported')
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

        // Layer A: sanitize imported plan course arrays so any invalid tokens in
        // the JSON file are dropped and surfaced rather than entering plan state.
        const { safePlan, dropped: importDropped } = sanitizePlan(validated.plan as Record<string, unknown[]>)
        const sanitizedState = { ...validated, plan: safePlan }
        if (importDropped.length > 0) {
          console.warn('[Import] dropped invalid course tokens:', importDropped)
        }

        dispatch({ type: 'SET_FULL_STATE', state: sanitizedState })

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

  // BUG 1 (TASK-080): opening a Radix Dialog from a DropdownMenuItem's onSelect
  // races the menu's unmount cleanup, which can leave `body { pointer-events: none }`
  // orphaned and freeze the page. Defer the open to the next frame so the menu has
  // fully unmounted (and released its scroll-lock) before the dialog mounts. Callers
  // must e.preventDefault() so Radix does not auto-close-then-reopen mid-frame.
  const openDialogAfterMenuClose = (open: () => void) => {
    requestAnimationFrame(open)
  }

  const handleReset = () => {
    openDialogAfterMenuClose(() => setResetConfirmOpen(true))
  }

  const nonPastSemCount = state.semesters.filter(s => s.status !== 'past').length

  return (
    <>
      <header className="h-14 border-b border-border flex items-center px-4 gap-2 bg-background">
        {/* Logo / wordmark — navigates home (planner) from any route */}
        <NavLink
          to="/"
          className="text-lg font-bold text-foreground mr-2 rounded-sm hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="DegreeForge home"
        >
          DegreeForge
        </NavLink>

        {/* Nav links (centered) — order: Planner · Progress · Settings */}
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
            to="/progress"
            className={({ isActive }) =>
              cn(
                buttonVariants({ variant: 'ghost' }),
                isActive && 'underline underline-offset-4 font-semibold',
              )
            }
          >
            Progress
          </NavLink>
          {/* Schedule + Career disabled for alpha launch — re-enable by restoring nav link + route element. */}
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

        {/* Actions: high-frequency planner actions stay in the header; everything
            else moves into the ⋯ More menu so the header can't overflow/clip. */}
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
              {/* AI hidden for soft launch — re-enable by setting AI_ENABLED=true in lib/features.ts */}
              {AI_ENABLED && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setChatOpen(true)}
                  title="Open AI Chat"
                  className={chatOpen ? 'bg-accent text-accent-foreground' : ''}
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="default"
                size="sm"
                className="gap-1.5"
                onClick={handleRecommendPlan}
                title="Recommend 4-Year Plan"
              >
                <Wand2 className="h-4 w-4" />
                Recommend
              </Button>
              <div className="w-[1px] h-4 bg-border mx-1" />
            </>
          )}

          {/* ⋯ More overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="More actions" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onSelect={() => dispatch({ type: 'UNDO' })}
                disabled={!canUndo}
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => dispatch({ type: 'REDO' })}
                disabled={!canRedo}
              >
                <Redo2 className="h-4 w-4" />
                Redo
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={handleExport}>
                <Download className="h-4 w-4" />
                Export Plan
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" />
                Import Plan
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  openDialogAfterMenuClose(() => setTransitionOpen(true))
                }}
              >
                <ChevronRight className="h-4 w-4" />
                Advance Semester
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => dispatch({ type: 'RETREAT_SEMESTER' })}
                disabled={!canReverse}
              >
                <ChevronLeft className="h-4 w-4" />
                Reverse Semester
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => setDark((d) => !d)}>
                {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                {dark ? 'Light mode' : 'Dark mode'}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault()
                  handleReset()
                }}
                className="text-red-600 focus:text-red-600 dark:text-red-400 dark:focus:text-red-400"
              >
                <RotateCcw className="h-4 w-4" />
                Reset Plan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".json"
            onChange={handleImport}
          />
        </div>

        <SemesterTransitionDialog open={transitionOpen} onOpenChange={setTransitionOpen} />
      </header>

      {/* Slim strip: Fastest/Easiest toggle + difficulty/GPA/grad-term readout.
          Always visible (no longer hidden under 1024px) and can't clip the header. */}
      {isPlannerRoute && <OptimizeStrip />}

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
