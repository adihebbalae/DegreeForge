import React, { useState, useMemo } from 'react';
import { usePlan, useSemesters } from '@/context/PlanContext';
import { useFallSections, useGradeDistributions } from '@/context/DataContext';
import { generateSchedules, type CandidateSchedule } from '@/lib/scheduler';
import { Check, Calendar as CalendarIcon, Info, ExternalLink, Copy, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export default function SchedulerPage() {
  const plan = usePlan();
  const allSections = useFallSections();
  const gradeDistributions = useGradeDistributions();

  // 1. Identify "Next Semester" (Fall 2026) courses from plan
  const nextSemesterCourses = useMemo(() => plan['Fall 2026'] ?? [], [plan]);

  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(nextSemesterCourses);
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0);

  // 2. Filter sections data for selected courses
  const selectedCourseData = useMemo(() => {
    return allSections.filter(c => selectedCourseIds.includes(c.course));
  }, [allSections, selectedCourseIds]);

  // 3. Generate candidate schedules
  const candidates = useMemo(() => {
    if (selectedCourseData.length === 0) return [];
    return generateSchedules(selectedCourseData, gradeDistributions);
  }, [selectedCourseData, gradeDistributions]);

  const activeSchedule = candidates[activeScheduleIndex] || null;

  const toggleCourse = (id: string) => {
    setSelectedCourseIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
    setActiveScheduleIndex(0);
  };

  const copyUniques = () => {
    if (!activeSchedule) return;
    const uniques = activeSchedule.sections.map(s => s.unique).join(', ');
    navigator.clipboard.writeText(uniques);
    alert(`Copied uniques: ${uniques}`);
  };

  return (
    <div className="h-full flex overflow-hidden bg-background">
      {/* ── Left Sidebar: Selector + Results ──────────────────────────────── */}
      <div className="flex-[35] border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-blue-500" />
            Fall 2026 Optimizer
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Select courses from your plan to generate conflict-free schedules.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Course Selector */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Courses in Plan
            </h3>
            <div className="grid gap-2">
              {nextSemesterCourses.length === 0 ? (
                <p className="text-xs italic text-muted-foreground p-2 border border-dashed rounded text-center">
                  No courses found in Fall 2026 plan.
                </p>
              ) : (
                nextSemesterCourses.map(id => (
                  <label 
                    key={id} 
                    className={cn(
                      "flex items-center justify-between p-2 rounded-md border cursor-pointer transition-colors",
                      selectedCourseIds.includes(id) 
                        ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800" 
                        : "hover:bg-accent border-transparent"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center",
                        selectedCourseIds.includes(id) ? "bg-blue-500 border-blue-500 text-white" : "border-input bg-background"
                      )}>
                        {selectedCourseIds.includes(id) && <Check className="w-3 h-3" />}
                      </div>
                      <span className="text-sm font-medium">{id}</span>
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={selectedCourseIds.includes(id)}
                      onChange={() => toggleCourse(id)}
                    />
                  </label>
                ))
              )}
            </div>
          </div>

          <Separator />

          {/* Results List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Top Candidates ({candidates.length})
              </h3>
              {candidates.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">Ranked by GPA</Badge>
              )}
            </div>

            <div className="space-y-2">
              {candidates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">
                  {selectedCourseIds.length > 0 
                    ? "No conflict-free schedules found for this selection." 
                    : "Select courses above to begin."}
                </p>
              ) : (
                candidates.map((c, i) => (
                  <Card 
                    key={i} 
                    className={cn(
                      "cursor-pointer transition-all hover:shadow-md border-2",
                      activeScheduleIndex === i 
                        ? "border-blue-500 shadow-sm" 
                        : "border-transparent"
                    )}
                    onClick={() => setActiveScheduleIndex(i)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-bold text-blue-600">Option #{i + 1}</span>
                        <div className="flex gap-1">
                          <Badge className="bg-green-500 text-white text-[10px]">
                            {c.avgGpa.toFixed(2)} GPA
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {c.sections.map(s => (
                          <span key={s.courseId} className="text-[10px] bg-muted px-1 rounded">
                            {s.courseId}
                          </span>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </div>

        {activeSchedule && (
          <div className="p-4 border-t border-border bg-muted/10">
            <Button className="w-full gap-2" onClick={copyUniques}>
              <Copy className="w-4 h-4" />
              Copy Unique Numbers
            </Button>
          </div>
        )}
      </div>

      {/* ── Right Content: Weekly Calendar ────────────────────────────────── */}
      <div className="flex-[65] flex flex-col overflow-hidden relative">
        {!activeSchedule ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <CalendarIcon className="w-16 h-16 mb-4" />
            <p>Select a schedule option to view the calendar</p>
          </div>
        ) : (
          <WeeklyCalendar schedule={activeSchedule} />
        )}
      </div>
    </div>
  );
}

// ─── Sub-Component: Weekly Calendar ───────────────────────────────────────────

function WeeklyCalendar({ schedule }: { schedule: CandidateSchedule }) {
  const days = ['M', 'T', 'W', 'R', 'F'];
  const dayLabels = { M: 'Mon', T: 'Tue', W: 'Wed', R: 'Thu', F: 'Fri' };
  
  // 8 AM to 9 PM
  const startHour = 8;
  const endHour = 21;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // Helper to get block position
  const getPosition = (timeStr: string) => {
    const match = timeStr.toLowerCase().match(/(\d+):(\d+)\s*([ap]\.m\.)/);
    if (!match) return 0;
    let [_, hStr, mStr, ampm] = match;
    let h = parseInt(hStr);
    let m = parseInt(mStr);
    if (ampm.startsWith('p') && h < 12) h += 12;
    if (ampm.startsWith('a') && h === 12) h = 0;
    
    const minutesSinceStart = (h * 60 + m) - (startHour * 60);
    return (minutesSinceStart / (13 * 60)) * 100; // 13 hours total (8am to 9pm)
  };

  const getDuration = (intervalStr: string) => {
    const parts = intervalStr.split('-');
    if (parts.length !== 2) return 0;
    
    const parse = (s: string) => {
      const m = s.toLowerCase().match(/(\d+):(\d+)\s*([ap]\.m\.)/);
      if (!m) return 0;
      let [_, hh, mm, ap] = m;
      let h = parseInt(hh);
      if (ap.startsWith('p') && h < 12) h += 12;
      if (ap.startsWith('a') && h === 12) h = 0;
      return h * 60 + parseInt(mm);
    };

    const start = parse(parts[0]);
    const end = parse(parts[1]);
    return ((end - start) / (13 * 60)) * 100;
  };

  const colors = [
    'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300',
    'bg-green-500/20 border-green-500 text-green-700 dark:text-green-300',
    'bg-purple-500/20 border-purple-500 text-purple-700 dark:text-purple-300',
    'bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-300',
    'bg-red-500/20 border-red-500 text-red-700 dark:text-red-300',
    'bg-teal-500/20 border-teal-500 text-teal-700 dark:text-teal-300',
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4">
      {/* Calendar Grid Header */}
      <div className="flex border-b border-border mb-2">
        <div className="w-16 shrink-0" />
        {days.map(d => (
          <div key={d} className="flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {dayLabels[d as keyof typeof dayLabels]}
          </div>
        ))}
      </div>

      {/* Scrollable Calendar Body */}
      <div className="flex-1 relative overflow-y-auto">
        <div className="flex h-[800px] relative">
          {/* Time axis */}
          <div className="w-16 shrink-0 flex flex-col">
            {hours.map(h => (
              <div key={h} className="flex-1 border-t border-transparent text-[10px] text-muted-foreground pr-2 text-right">
                {h > 12 ? `${h-12} PM` : h === 12 ? '12 PM' : `${h} AM`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div className="flex-1 flex relative">
            {days.map(d => (
              <div key={d} className="flex-1 border-l border-muted/30 relative bg-muted/5">
                {/* Horizontal grid lines */}
                {hours.map(h => (
                  <div 
                    key={h} 
                    className="absolute w-full border-t border-muted/20" 
                    style={{ top: `${((h - startHour) / 13) * 100}%` }} 
                  />
                ))}
              </div>
            ))}

            {/* Course Blocks Overlay */}
            <div className="absolute inset-0 pointer-events-none flex">
              <div className="w-px shrink-0" /> {/* Match axis spacer */}
              {days.map(d => (
                <div key={d} className="flex-1 relative">
                  {schedule.sections.map((s, idx) => {
                    const meetings = s.meetings.filter(m => m.days?.includes(d));
                    return meetings.map((m, midx) => (
                      <div
                        key={`${s.unique}-${midx}`}
                        className={cn(
                          "absolute left-1 right-1 border rounded p-1 overflow-hidden pointer-events-auto",
                          colors[idx % colors.length]
                        )}
                        style={{
                          top: `${getPosition(m.time.split('-')[0])}%`,
                          height: `${getDuration(m.time)}%`,
                        }}
                      >
                        <p className="text-[10px] font-bold truncate leading-tight">{s.courseId}</p>
                        <p className="text-[9px] truncate leading-tight opacity-80">{s.instructor}</p>
                        <p className="text-[8px] truncate leading-tight opacity-60">{m.room}</p>
                      </div>
                    ));
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
