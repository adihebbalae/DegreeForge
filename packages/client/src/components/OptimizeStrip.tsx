/**
 * OptimizeStrip — TASK-073
 *
 * A slim full-width strip directly below the header that hosts the Fastest/Easiest
 * toggle and the difficulty / GPA / graduation-term readout. Pulled out of the
 * crowded header so:
 *   - the readout is ALWAYS visible (it was previously hidden below 1024px via
 *     `lg:flex` inside PlanOptimizeControl — a real bug), and
 *   - the "(defers grad)" note lives here, so it can never widen and clip the
 *     header's "Advance Semester" control.
 *
 * Only relevant on the planner; callers render it on planner routes only.
 */

import PlanOptimizeControl from './PlanOptimizeControl';

export default function OptimizeStrip() {
  return (
    <div
      className="h-7 min-h-7 border-b border-border bg-muted/30 flex items-center px-4"
      data-testid="optimize-strip"
    >
      <PlanOptimizeControl />
    </div>
  );
}
