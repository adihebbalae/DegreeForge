/**
 * RequirementProgress — TASK-076
 *
 * Labeled requirement progress bars for the landing-dashboard home variant.
 * REUSES computeProgress (lib/progress.ts) with the exact same context wiring as
 * the planner's ProgressBars strip — the numbers can never disagree with the
 * planner. This component only re-presents that one computation as a roomier,
 * named grid suited to the dashboard (the antidote to the dense planner strip).
 */

import { useMemo } from 'react';
import { usePlan, useTechCoreId, useMathBAToggle, useWhatIf } from '@/context/PlanContext';
import {
  useCatalogRecord,
  useDegreeRequirements,
  useUserProfile,
  useTechCoresRecord,
} from '@/context/DataContext';
import { computeProgress } from '@/lib/progress';
import { cn } from '@/lib/utils';

interface BarSpec {
  label: string;
  completed: number;
  total: number;
  unit: string;
  /** Tailwind background color for the filled portion. */
  color: string;
}

export function RequirementProgress() {
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const degreeReqs = useDegreeRequirements();
  const profile = useUserProfile();
  const techCores = useTechCoresRecord();

  const currentTechCoreId = useTechCoreId();
  const currentMathBA = useMathBAToggle();
  const whatIf = useWhatIf();

  const techCoreId = whatIf.isActive ? whatIf.techCoreId : currentTechCoreId;
  const mathBAToggle = whatIf.isActive ? whatIf.mathBAToggle : currentMathBA;

  const progress = useMemo(() => {
    if (!catalog || !degreeReqs || !profile || !techCores) return null;
    const techCore = techCores[techCoreId];
    if (!techCore) return null;
    return computeProgress(plan, profile, catalog, degreeReqs, techCore, mathBAToggle);
  }, [plan, catalog, degreeReqs, profile, techCores, techCoreId, mathBAToggle]);

  if (!progress) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted/40" />
        ))}
      </div>
    );
  }

  const bars: BarSpec[] = [
    { label: 'ECE Core', completed: progress.eceCoreCompleted, total: progress.eceCoreTotal, unit: 'courses', color: 'bg-[hsl(16_70%_50%)]' },
    { label: 'Gen Ed', completed: progress.genEdCompleted, total: progress.genEdTotal, unit: 'courses', color: 'bg-emerald-500' },
    { label: 'Tech Core', completed: progress.techCoreCompleted, total: progress.techCoreTotal, unit: 'courses', color: 'bg-violet-500' },
    { label: 'Electives', completed: progress.electiveHours, total: progress.electiveTotalHours, unit: 'hrs', color: 'bg-amber-500' },
  ];

  if (mathBAToggle && progress.mathBATotal) {
    bars.push({
      label: 'Math BA',
      completed: progress.mathBACompleted ?? 0,
      total: progress.mathBATotal,
      unit: 'courses',
      color: 'bg-rose-500',
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">Requirements</span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {progress.totalHours} / {progress.totalHoursTarget} hrs
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {bars.map((bar) => {
          const pct = Math.min(100, Math.round((bar.completed / (bar.total || 1)) * 100));
          return (
            <div key={bar.label}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-foreground">{bar.label}</span>
                <span className="tabular-nums text-xs text-muted-foreground">
                  {bar.completed} / {bar.total} {bar.unit}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', bar.color)}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
