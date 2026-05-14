import { useEffect, useState, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { Moon, Sun, Download, Upload, RotateCcw, Undo2, Redo2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { usePlanContext, usePlanDispatch, useCanUndo, useCanRedo } from '@/context/PlanContext'
import SemesterTransitionDialog from './SemesterTransitionDialog'

export default function Header() {
  const { state } = usePlanContext()
  const dispatch = usePlanDispatch()
  const canUndo = useCanUndo()
  const canRedo = useCanRedo()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [transitionOpen, setTransitionOpen] = useState(false)

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

  const handleExport = () => {
    const dataStr = JSON.stringify(state, null, 2)
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

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const parsed = JSON.parse(content)
        if (parsed.semesters && parsed.plan) {
          dispatch({ type: 'SET_FULL_STATE', state: parsed })
        } else {
          alert('Invalid plan file format')
        }
      } catch (err) {
        console.error('Import failed:', err)
        alert('Failed to parse plan file')
      }
    }
    reader.readAsText(file)
    // Reset input so the same file can be uploaded again if needed
    event.target.value = ''
  }

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset your plan to the initial state? This cannot be undone.')) {
      dispatch({ type: 'RESET_PLAN' })
    }
  }

  return (
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
      </nav>

      {/* Actions */}
      <div className="flex items-center gap-1">
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
  )
}
