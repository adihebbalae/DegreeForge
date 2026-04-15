import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Header() {
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

  return (
    <header className="h-14 border-b border-border flex items-center px-4 gap-4 bg-background">
      {/* Logo / wordmark */}
      <span className="text-lg font-bold text-foreground select-none">DegreeForge</span>

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

      {/* Dark mode toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setDark((d) => !d)}
        aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  )
}
