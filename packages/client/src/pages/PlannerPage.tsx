import { useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TimelineGrid from '@/components/TimelineGrid'
import CoursePalette from '@/components/CoursePalette'

export default function PlannerPage() {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* ── Progress bars strip ─────────────────────────────────────────── */}
      <div className="h-12 shrink-0 border-b border-border flex items-center px-4 bg-muted/30">
        <span className="text-sm text-muted-foreground">
          Progress bars — TASK-009
        </span>
      </div>

      {/* ── Main content row ────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Semester timeline grid — left ~65% */}
        <div className="flex-[65] overflow-hidden border-r border-border">
          <TimelineGrid />
        </div>

        {/* Course palette — right ~35% */}
        <div className="flex-[35] overflow-hidden">
          <CoursePalette />
        </div>
      </div>

      {/* ── Chat slide-in panel ──────────────────────────────────────────── */}
      <aside
        className={[
          'absolute inset-y-0 right-0 w-80',
          'bg-background border-l border-border shadow-lg',
          'flex flex-col transition-transform duration-300 ease-in-out',
          chatOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
        aria-label="AI chat panel"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="font-medium">AI Chat</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setChatOpen(false)}
            aria-label="Close chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-sm text-muted-foreground">Chat panel — TASK-013</p>
        </div>
      </aside>

      {/* ── Chat floating toggle button ──────────────────────────────────── */}
      {!chatOpen && (
        <Button
          className="absolute bottom-4 right-4 shadow-lg"
          size="icon"
          onClick={() => setChatOpen(true)}
          aria-label="Open AI chat"
        >
          <MessageSquare className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
