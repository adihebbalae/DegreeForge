/**
 * PlanOptimizeControl — TASK-068
 *
 * Header control for the planner's optimization objective.
 *   - A fastest ↔ easiest toggle that drives the "Recommend Plan" run.
 *   - A live readout of the selected mode's aggregate difficulty, expected GPA,
 *     and graduation term, so the GPA-not-speed tradeoff is visible: choosing
 *     "easiest" may defer graduation in exchange for a lower-stress plan.
 *
 * The toggle only sets the objective for the next Recommend run; it does not
 * mutate the plan. The readout previews both modes (usePlanOptimizeSummary) so it
 * updates the moment the user toggles, before committing.
 */

import { Gauge, GraduationCap } from 'lucide-react';
import { useUi } from '@/context/UiContext';
import { useSemesters } from '@/context/PlanContext';
import { usePlanOptimizeSummary } from '@/hooks/usePlanOptimizeSummary';
import { cn } from '@/lib/utils';
import type { OptimizeMode } from '@/lib/solver';

function semesterLabel(semesterId: string | null, labels: Map<string, string>): string {
  if (!semesterId) return '—';
  return labels.get(semesterId) ?? semesterId;
}

export default function PlanOptimizeControl() {
  const { optimizeMode, setOptimizeMode } = useUi();
  const semesters = useSemesters();
  const summaries = usePlanOptimizeSummary();

  const labels = new Map(semesters.map((s) => [s.id, s.id]));
  const summary = summaries ? summaries[optimizeMode] : null;

  // Honest tradeoff hint: easiest defers graduation relative to fastest.
  const defersGraduation =
    summaries !== null &&
    summaries.fastest.graduationSemesterId !== null &&
    summaries.easiest.graduationSemesterId !== null &&
    summaries.easiest.graduationSemesterId !== summaries.fastest.graduationSemesterId;

  const Pill = ({ mode, children }: { mode: OptimizeMode; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={() => setOptimizeMode(mode)}
      aria-pressed={optimizeMode === mode}
      className={cn(
        'px-2 py-0.5 text-xs font-medium rounded-sm transition-colors',
        optimizeMode === mode
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );

  return (
    <div className="flex items-center gap-2" data-testid="plan-optimize-control">
      <div className="flex items-center rounded-md bg-muted p-0.5" role="group" aria-label="Plan optimization objective">
        <Pill mode="fastest">Fastest</Pill>
        <Pill mode="easiest">Easiest</Pill>
      </div>

      {summary && (
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground"
          data-testid="plan-optimize-readout"
        >
          <span className="flex items-center gap-1" title="Hardest term's difficulty (0–100, peak per-semester Stress Score). Easiest lowers it by spreading hard courses.">
            <Gauge className="h-3.5 w-3.5" />
            <span data-testid="readout-difficulty" className="tabular-nums">{summary.aggregateDifficulty}</span>
          </span>
          <span className="flex items-center gap-1" title="Credit-weighted expected GPA across future courses">
            GPA
            <span data-testid="readout-gpa" className="tabular-nums font-medium text-foreground">
              {summary.expectedGpa !== null ? summary.expectedGpa.toFixed(2) : '—'}
            </span>
          </span>
          <span className="flex items-center gap-1" title="Earliest graduation term for this objective">
            <GraduationCap className="h-3.5 w-3.5" />
            <span data-testid="readout-gradterm" className="font-medium text-foreground">
              {semesterLabel(summary.graduationSemesterId, labels)}
            </span>
          </span>
          {optimizeMode === 'easiest' && defersGraduation && (
            <span
              className="text-amber-600 dark:text-amber-400"
              title="Easiest minimizes difficulty but graduates later than Fastest"
              data-testid="readout-tradeoff"
            >
              (defers grad)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
