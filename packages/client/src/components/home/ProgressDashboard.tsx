/**
 * ProgressDashboard — TASK-076 (landing-dashboard variant, returning visitor)
 *
 * A calm "where am I / what's next" summary that replaces the cold-open planner
 * cockpit for a user who has already onboarded:
 *   - "On track for {gradTerm}" derived from the live solver readout
 *     (usePlanOptimizeSummary) for the currently selected objective.
 *   - Requirement progress bars (RequirementProgress → computeProgress; reused).
 *   - The next planned term's courses with a credit / stress / prereq summary
 *     (useNextTerm; reuses the planner's own credit, stress, and validator libs).
 *   - Quick actions into the full planner, scheduler, and what-if.
 *
 * Quick actions route via React Router. "What-If" routes to /plan (the what-if
 * panel is a planner-local slide-in owned by UiContext, which is not in scope to
 * open from here) — the destination is unambiguous and within file boundaries.
 */

import { useNavigate } from 'react-router-dom';
import { GraduationCap, Layers, FlaskConical, ArrowRight, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useUi } from '@/context/UiContext';
import { useCatalogRecord, usePrereqGraph } from '@/context/DataContext';
import { usePlanOptimizeSummary } from '@/hooks/usePlanOptimizeSummary';
import { getCourseTitle } from '@/lib/course-utils';
import { track } from '@/lib/analytics';
import { RequirementProgress } from './RequirementProgress';
import { useNextTerm } from './useNextTerm';
import type { StressBand } from '@/lib/stress-score';

const STRESS_LABEL: Record<StressBand, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

const STRESS_TONE: Record<StressBand, string> = {
  low: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  high: 'text-rose-600 dark:text-rose-400',
};

function NextTermCard() {
  const nextTerm = useNextTerm();
  const catalog = useCatalogRecord();
  const prereqNodes = usePrereqGraph().nodes;

  if (!nextTerm) {
    return (
      <Card className="p-5" data-testid="next-term-card">
        <div className="mb-1 text-sm font-medium text-foreground">Next term</div>
        <p className="text-sm text-muted-foreground">
          No upcoming courses planned yet. Open the planner to build your schedule.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5" data-testid="next-term-card">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-foreground">
          Next term — {nextTerm.semesterId}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {nextTerm.totalCredits} hrs
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {nextTerm.courseIds.map((id) => (
          <span
            key={id}
            title={getCourseTitle(id, catalog, prereqNodes)}
            className="rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium text-foreground"
          >
            {id}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        <span className="flex items-center gap-1">
          <span className="text-muted-foreground">Stress</span>
          <span className={cn('font-medium', STRESS_TONE[nextTerm.stressBand])}>
            {STRESS_LABEL[nextTerm.stressBand]} ({nextTerm.stressScore})
          </span>
        </span>
        {nextTerm.hasPrereqIssue ? (
          <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {nextTerm.prereqIssueCount} prereq {nextTerm.prereqIssueCount === 1 ? 'issue' : 'issues'}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Prereqs OK
          </span>
        )}
      </div>
    </Card>
  );
}

export function ProgressDashboard() {
  const navigate = useNavigate();
  const { optimizeMode } = useUi();
  const summaries = usePlanOptimizeSummary();

  const summary = summaries ? summaries[optimizeMode] : null;
  const gradTerm = summary?.graduationSemesterId ?? null;
  const modeLabel = optimizeMode === 'easiest' ? 'Easiest' : 'Fastest';

  const goto = (path: string, action: string) => {
    track('home_dashboard_action', { action });
    navigate(path);
  };

  return (
    <div className="mx-auto h-full w-full max-w-4xl overflow-y-auto px-6 py-8">
      {/* On track for {gradTerm} */}
      <div className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {gradTerm ? (
              <>On track for {gradTerm}</>
            ) : (
              <>Your degree plan</>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            {gradTerm ? `${modeLabel} objective` : 'Open the planner to get started'}
          </p>
        </div>
      </div>

      {/* Requirement progress (reused computeProgress) */}
      <Card className="mb-5 p-5">
        <RequirementProgress />
      </Card>

      {/* Next term */}
      <div className="mb-6">
        <NextTermCard />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        {/* Schedule + Career disabled for alpha launch — components retained; re-enable by restoring the nav link + route element. */}
        <Button onClick={() => goto('/plan', 'view_full_plan')} className="gap-2">
          <Layers className="h-4 w-4" />
          View full plan
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => goto('/plan', 'what_if')} className="gap-2">
          <FlaskConical className="h-4 w-4" />
          What-If
        </Button>
      </div>
    </div>
  );
}
