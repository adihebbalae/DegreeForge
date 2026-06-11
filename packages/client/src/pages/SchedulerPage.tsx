import { useState, useMemo, useEffect } from 'react';
import { usePlan } from '@/context/PlanContext';
import { useFallSections, useGradeDistributions } from '@/context/DataContext';
import { useSettings, useSettingsDispatch } from '@/context/SettingsContext';
import { generateSchedules, type CandidateSchedule, type ScoreWeights } from '@/lib/scheduler';
import { fetchJson } from '@/lib/data-loaders';
import {
  FACTOR_LABELS,
  SCORE_TO_SETTINGS_KEY,
  settingsToScoreWeights,
  settingsTimeWindowToScoreWindows,
  settingsInstructionModeToPreferredMode,
} from '@/lib/scheduler-settings';
import { Check, Calendar as CalendarIcon, Copy, ChevronDown, ChevronRight, SlidersHorizontal, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import WeeklyCalendar from '@/components/scheduler/WeeklyCalendar';
import CandidateCard from '@/components/scheduler/CandidateCard';

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
  const { candidates, searchTruncated } = useMemo(() => {
    if (selectedCourseData.length === 0) return { candidates: [], searchTruncated: false };
    const result = generateSchedules(selectedCourseData, gradeDistributions, {
      weights,
      preferredWindows,
      buildingDistances,
      preferredMode,
      // daySpreadPreference: not yet a settings field; weight controls importance
      daySpreadPreference: null,
      profPreferences: settings.profPreferences,
    });
    return { candidates: result.candidates, searchTruncated: result.truncated };
  }, [selectedCourseData, gradeDistributions, weights, preferredWindows, buildingDistances, preferredMode, settings.profPreferences]);

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

            {searchTruncated && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded px-2 py-1.5 leading-snug">
                Too many combinations — showing the best of a partial search. Narrow your course selection or add filters.
              </p>
            )}

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
