import React, { useState, useMemo, useEffect } from 'react';
import { usePlan } from '@/context/PlanContext';
import { useFallSections, useGradeDistributions } from '@/context/DataContext';
import { useSettings, useSettingsDispatch, type SchedulerWeights, type InstructionMode, type TimeWindow as SettingsTimeWindow } from '@/context/SettingsContext';
import { generateSchedules, type CandidateSchedule, type ScoreWeights } from '@/lib/scheduler';
import { type TimeWindow } from '@/lib/score';
import { fetchJson } from '@/lib/data-loaders';
import { Check, Calendar as CalendarIcon, Copy, ChevronDown, ChevronRight, SlidersHorizontal, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const FACTOR_LABELS: Record<keyof ScoreWeights, string> = {
  gpa: 'Course GPA',
  timeOfDay: 'Time of Day',
  buildingBreak: 'Building Distance',
  instructionMode: 'Instruction Mode',
  professor: 'Instructor GPA',
  daySpread: 'Day Spread',
};

/**
 * Maps SettingsContext SchedulerWeights keys → score.ts ScoreWeights keys.
 * The two use different naming conventions for historical reasons.
 */
function settingsToScoreWeights(sw: SchedulerWeights): ScoreWeights {
  return {
    gpa: sw.gpa,
    timeOfDay: sw.timeFit,
    buildingBreak: sw.buildingPenalty,
    instructionMode: sw.instructionMode,
    professor: sw.professorPreference,
    daySpread: sw.daySpread,
  };
}

/** Reverse mapping: ScoreWeights key → SchedulerWeights key */
const SCORE_TO_SETTINGS_KEY: Record<keyof ScoreWeights, keyof SchedulerWeights> = {
  gpa: 'gpa',
  timeOfDay: 'timeFit',
  buildingBreak: 'buildingPenalty',
  instructionMode: 'instructionMode',
  professor: 'professorPreference',
  daySpread: 'daySpread',
};

/**
 * Converts a SettingsContext TimeWindow string to score.ts TimeWindow array.
 * Returns an empty array for 'no_preference' (all times score 1.0).
 */
function settingsTimeWindowToScoreWindows(tw: SettingsTimeWindow): TimeWindow[] {
  switch (tw) {
    case 'no_early':
      // Avoid before 10 AM: preferred window is 10 AM – 9 PM
      return [{ start: 600, end: 1260 }];
    case 'no_late':
      // Avoid after 5 PM: preferred window is 8 AM – 5 PM
      return [{ start: 480, end: 1020 }];
    case 'mornings_only':
      // 8 AM – 12 PM
      return [{ start: 480, end: 720 }];
    case 'afternoons_only':
      // 12 PM – 6 PM
      return [{ start: 720, end: 1080 }];
    case 'no_preference':
    default:
      return [];
  }
}

/**
 * Converts a SettingsContext InstructionMode to the score.ts preferredMode.
 * Returns null for 'no_preference'.
 */
function settingsInstructionModeToPreferredMode(
  mode: InstructionMode
): 'in-person' | 'online' | 'hybrid' | null {
  switch (mode) {
    case 'in_person': return 'in-person';
    case 'online': return 'online';
    case 'hybrid': return 'hybrid';
    case 'no_preference':
    default:
      return null;
  }
}

export default function SchedulerPage() {
  const plan = usePlan();
  const allSections = useFallSections();
  const gradeDistributions = useGradeDistributions();
  const settings = useSettings();
  const settingsDispatch = useSettingsDispatch();

  // Load building distances once on mount
  const [buildingDistances, setBuildingDistances] = useState<Record<string, number>>({});
  useEffect(() => {
    fetchJson<{ distances: Record<string, number> }>('/data/building-distances.json')
      .then(data => setBuildingDistances(data.distances))
      .catch(() => {
        // Non-fatal: scoring degrades gracefully to 0-penalty for all transitions
      });
  }, []);

  // 1. Identify "Next Semester" (Fall 2026) courses from plan
  const nextSemesterCourses = useMemo(() => plan['Fall 2026'] ?? [], [plan]);

  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(nextSemesterCourses);
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0);
  const [copyConfirmed, setCopyConfirmed] = useState(false);

  // Weights from SettingsContext, adapted to ScoreWeights shape
  const weights = useMemo(() => settingsToScoreWeights(settings.schedulerWeights), [settings.schedulerWeights]);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [whyOpenIndex, setWhyOpenIndex] = useState<number | null>(null);

  // Derive scoring options from settings
  const preferredWindows = useMemo(
    () => settingsTimeWindowToScoreWindows(settings.timeWindow),
    [settings.timeWindow]
  );
  const preferredMode = useMemo(
    () => settingsInstructionModeToPreferredMode(settings.instructionMode),
    [settings.instructionMode]
  );

  // 2. Filter sections data for selected courses
  const selectedCourseData = useMemo(() => {
    return allSections.filter(c => selectedCourseIds.includes(c.course));
  }, [allSections, selectedCourseIds]);

  // 3. Generate candidate schedules using all 6 factors with full settings plumbed through
  const candidates = useMemo(() => {
    if (selectedCourseData.length === 0) return [];
    return generateSchedules(selectedCourseData, gradeDistributions, {
      weights,
      preferredWindows,
      buildingDistances,
      preferredMode,
      // daySpreadPreference: not yet a settings field; weight controls importance
      daySpreadPreference: null,
    });
  }, [selectedCourseData, gradeDistributions, weights, preferredWindows, buildingDistances, preferredMode]);

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
    setCopyConfirmed(true);
    setTimeout(() => setCopyConfirmed(false), 2500);
  };

  const handleWeightChange = (factor: keyof ScoreWeights, value: number) => {
    const settingsKey = SCORE_TO_SETTINGS_KEY[factor];
    settingsDispatch({ type: 'SET_SCHEDULER_WEIGHTS', weights: { [settingsKey]: value } });
    setActiveScheduleIndex(0);
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

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* ── Weights Panel ────────────────────────────────────────────── */}
          <div className="border border-border rounded-md overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
              onClick={() => setWeightsOpen(prev => !prev)}
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
                Scoring Weights
              </span>
              {weightsOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>

            {weightsOpen && (
              <div className="p-3 space-y-3 bg-background">
                <p className="text-[10px] text-muted-foreground">
                  Drag sliders to adjust how each factor contributes to schedule ranking.
                  Weights are normalized automatically.
                </p>
                {(Object.keys(weights) as Array<keyof ScoreWeights>).map(factor => (
                  <div key={factor} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-foreground">{FACTOR_LABELS[factor]}</label>
                      <span className="text-[10px] font-mono text-muted-foreground w-8 text-right">
                        {weights[factor].toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={weights[factor]}
                      onChange={e => handleWeightChange(factor, parseFloat(e.target.value))}
                      className="w-full h-1.5 accent-blue-500 cursor-pointer"
                    />
                  </div>
                ))}
                <button
                  className="text-[10px] text-blue-500 hover:underline"
                  onClick={() => settingsDispatch({
                    type: 'SET_SCHEDULER_WEIGHTS',
                    weights: { gpa: 0.35, timeFit: 0.20, buildingPenalty: 0.10, instructionMode: 0.15, professorPreference: 0.15, daySpread: 0.05 },
                  })}
                >
                  Reset to defaults
                </button>
              </div>
            )}
          </div>

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
                <Badge variant="secondary" className="text-[10px]">Ranked by Score</Badge>
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
                  <CandidateCard
                    key={i}
                    candidate={c}
                    index={i}
                    isActive={activeScheduleIndex === i}
                    onSelect={() => setActiveScheduleIndex(i)}
                    whyOpen={whyOpenIndex === i}
                    onToggleWhy={() => setWhyOpenIndex(whyOpenIndex === i ? null : i)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {activeSchedule && (
          <div className="p-4 border-t border-border bg-muted/10 space-y-2">
            <Button className="w-full gap-2" onClick={copyUniques}>
              {copyConfirmed ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copyConfirmed ? 'Copied to clipboard' : 'Copy Unique Numbers'}
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

// ─── Sub-Component: Candidate Card ────────────────────────────────────────────

interface CandidateCardProps {
  candidate: CandidateSchedule;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  whyOpen: boolean;
  onToggleWhy: () => void;
}

function CandidateCard({ candidate, index, isActive, onSelect, whyOpen, onToggleWhy }: CandidateCardProps) {
  const { factorScores, weights } = candidate;

  const totalWeight = weights
    ? (Object.values(weights) as number[]).reduce((s, w) => s + w, 0)
    : 1;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md border-2",
        isActive ? "border-blue-500 shadow-sm" : "border-transparent"
      )}
      onClick={onSelect}
    >
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-blue-600">Option #{index + 1}</span>
          <div className="flex gap-1">
            <Badge className="bg-green-500 text-white text-[10px]">
              {candidate.avgGpa.toFixed(2)} GPA
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {(candidate.score * 100).toFixed(0)} pts
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {candidate.sections.map(s => (
            <span key={s.courseId} className="text-[10px] bg-muted px-1 rounded">
              {s.courseId}
            </span>
          ))}
        </div>

        {/* Why this schedule? */}
        {factorScores && weights && (
          <div>
            <button
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={e => { e.stopPropagation(); onToggleWhy(); }}
            >
              {whyOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              Why this schedule?
            </button>

            {whyOpen && (
              <div className="mt-2 space-y-1 bg-muted/20 rounded p-2">
                {(Object.keys(factorScores) as Array<keyof typeof factorScores>).map(factor => {
                  const fScore = factorScores[factor];
                  const w = weights[factor];
                  const contribution = totalWeight > 0 ? (fScore * w) / totalWeight : 0;
                  return (
                    <div key={factor} className="flex items-center justify-between text-[9px] font-mono">
                      <span className="text-muted-foreground capitalize w-28 truncate">
                        {FACTOR_LABELS[factor]}
                      </span>
                      <span className="text-foreground">
                        {fScore.toFixed(2)} × {w.toFixed(2)} = {contribution.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-[9px] font-mono font-bold">
                  <span>Composite</span>
                  <span>{candidate.score.toFixed(3)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
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
