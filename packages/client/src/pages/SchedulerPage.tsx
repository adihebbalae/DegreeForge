export default function SchedulerPage() {
  return (
    <div className="h-full flex overflow-hidden">
      {/* Course selector + ranked schedule cards — left ~40% */}
      <div className="flex-[40] border-r border-border overflow-y-auto p-4">
        <p className="text-sm text-muted-foreground">
          Course Selector + Schedule Cards — TASK-015
        </p>
      </div>

      {/* Weekly calendar view — right ~60% */}
      <div className="flex-[60] overflow-auto p-4">
        <p className="text-sm text-muted-foreground">
          Weekly Calendar View — TASK-016
        </p>
      </div>
    </div>
  )
}
