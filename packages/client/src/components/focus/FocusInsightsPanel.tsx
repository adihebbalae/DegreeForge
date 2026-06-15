/**
 * FocusInsightsPanel — TASK-094
 *
 * Right-panel "Insights" layout for the FocusEditor.
 * Presents existing signals for the focused term:
 *   - Credit load vs cap + slack
 *   - Per-course stress breakdown (same data as StressBadge tooltip)
 *   - Critical-path slice (which courses here appear in the critical path / bottlenecks)
 *   - Unlocks next (downstream courses gated by this term's courses)
 *
 * Pure presentation — no logic is re-implemented here. All signals come from
 * existing hooks: useStressScore, useDiagnostics, usePrereqGraph.
 */

import { useMemo } from 'react';
import { GitBranch, AlertTriangle, Unlock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePlan } from '@/context/PlanContext';
import { useCatalogRecord } from '@/context/DataContext';
import { getCourseCredits, getCourseTitle } from '@/lib/course-utils';
import { STRESS_BAND_LABEL } from '@/lib/stress-score';
import { useStressScore } from '@/hooks/useStressScore';
import { useDiagnostics } from '@/hooks/useDiagnostics';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import type { Semester } from '@/types';

interface FocusInsightsPanelProps {
  semester: Semester;
  creditHourCap: number;
}

export default function FocusInsightsPanel({ semester, creditHourCap }: FocusInsightsPanelProps) {
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const stressMap = useStressScore();
  const diagnostics = useDiagnostics();
  const prereqGraph = usePrereqGraph();

  const courseIds = plan[semester.id] ?? [];

  // ── Credit load ──────────────────────────────────────────────────────────────
  const totalCredits = useMemo(
    () => courseIds.reduce((sum, id) => sum + getCourseCredits(id, catalog), 0),
    [courseIds, catalog],
  );
  const slack = creditHourCap - totalCredits;

  // ── Stress breakdown ─────────────────────────────────────────────────────────
  const stressResult = stressMap?.get(semester.id) ?? null;

  // ── Critical-path slice ───────────────────────────────────────────────────────
  // Single pass over diagnostics data to derive all three per-semester values.
  const { criticalPathCourseIds, bottleneckCourseIds, bottleneckById } = useMemo(() => {
    if (!diagnostics) {
      return {
        criticalPathCourseIds: new Set<string>(),
        bottleneckCourseIds: new Set<string>(),
        bottleneckById: new Map<string, string>(),
      };
    }
    const criticalPathCourseIds = new Set<string>();
    const bottleneckCourseIds = new Set<string>();
    const bottleneckById = new Map<string, string>();
    for (const link of diagnostics.criticalPath.chain) {
      if (link.semesterId === semester.id) criticalPathCourseIds.add(link.courseId);
    }
    for (const b of diagnostics.bottlenecks) {
      if (b.semesterId === semester.id) {
        bottleneckCourseIds.add(b.courseId);
        bottleneckById.set(b.courseId, b.whyItMatters);
      }
    }
    return { criticalPathCourseIds, bottleneckCourseIds, bottleneckById };
  }, [diagnostics, semester.id]);

  // ── Unlocks next ─────────────────────────────────────────────────────────────
  // For each course in the term, get downstream courses it gates. De-duplicate.
  const unlockedCourses = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ courseId: string; via: string }> = [];
    for (const id of courseIds) {
      for (const downstream of prereqGraph.getDownstream(id)) {
        if (!seen.has(downstream)) {
          seen.add(downstream);
          result.push({ courseId: downstream, via: id });
        }
      }
    }
    return result.slice(0, 12);
  }, [courseIds, prereqGraph]);

  const loadClass = slack < 0
    ? 'text-red-600 dark:text-red-400'
    : slack <= 3
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';

  const bandClass: Record<string, string> = {
    low: 'text-emerald-600 dark:text-emerald-400',
    medium: 'text-amber-600 dark:text-amber-400',
    high: 'text-red-600 dark:text-red-400',
  };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-4 text-sm">

      {/* Load */}
      <section>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
          Load
        </h3>
        <div className="flex items-baseline gap-2">
          <span className={cn('text-lg font-semibold tabular-nums', loadClass)}>
            {totalCredits}
          </span>
          <span className="text-muted-foreground text-xs">
            / {creditHourCap} hrs
          </span>
          <span className={cn('text-xs ml-auto', loadClass)}>
            {slack >= 0 ? `${slack} spare` : `${Math.abs(slack)} over`}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all',
              slack < 0 ? 'bg-red-500' : slack <= 3 ? 'bg-amber-500' : 'bg-emerald-500',
            )}
            style={{ width: `${Math.min(100, (totalCredits / creditHourCap) * 100)}%` }}
          />
        </div>
      </section>

      {/* Stress breakdown */}
      {stressResult && stressResult.totalCourses > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <Zap className="h-3 w-3" aria-hidden="true" />
            Stress
            <span className={cn('ml-auto text-xs font-semibold normal-case tracking-normal', bandClass[stressResult.band])}>
              {STRESS_BAND_LABEL[stressResult.band]} {stressResult.score}
            </span>
          </h3>
          <ul className="flex flex-col gap-1">
            {stressResult.courses.map((entry) => (
              <li key={entry.courseId} className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-foreground/80 w-20 shrink-0 truncate">
                  {entry.courseId}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full',
                      entry.difficulty >= 60 ? 'bg-red-500' : entry.difficulty >= 35 ? 'bg-amber-500' : 'bg-emerald-500',
                    )}
                    style={{ width: `${entry.difficulty}%` }}
                  />
                </div>
                <span className={cn(
                  'text-[11px] tabular-nums w-8 text-right shrink-0',
                  entry.hasNoData ? 'text-muted-foreground' : 'text-foreground/70',
                )}>
                  {entry.hasNoData ? '—' : entry.difficulty}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground mt-1">
            {stressResult.coursesWithData}/{stressResult.totalCourses} courses have grade data
          </p>
        </section>
      )}

      {/* Critical-path slice */}
      {(criticalPathCourseIds.size > 0 || bottleneckCourseIds.size > 0) && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            Critical Path
          </h3>
          <ul className="flex flex-col gap-1">
            {courseIds.filter((id) => criticalPathCourseIds.has(id) || bottleneckCourseIds.has(id)).map((id) => {
              const isCrit = criticalPathCourseIds.has(id);
              const isBottleneck = bottleneckCourseIds.has(id);
              const why = bottleneckById.get(id);
              return (
                <li key={id} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    {isBottleneck ? (
                      <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <GitBranch className="h-3 w-3 text-primary shrink-0" aria-hidden="true" />
                    )}
                    <span className="text-xs font-medium text-foreground">{id}</span>
                    {isCrit && !isBottleneck && (
                      <span className="text-[10px] text-primary ml-auto">on critical path</span>
                    )}
                  </div>
                  {why && (
                    <p className="text-[10px] text-muted-foreground pl-5 leading-tight">{why}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Unlocks next */}
      {unlockedCourses.length > 0 && (
        <section>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
            <Unlock className="h-3 w-3" aria-hidden="true" />
            Unlocks Next
          </h3>
          <ul className="flex flex-col gap-0.5">
            {unlockedCourses.map(({ courseId, via }) => {
              // prereq-node titles unused here — catalog-only lookup
              const title = getCourseTitle(courseId, catalog, {});
              return (
                <li key={courseId} className="flex items-baseline gap-2">
                  <span className="text-xs tabular-nums text-foreground/80 shrink-0">{courseId}</span>
                  {title !== courseId && (
                    <span className="text-[11px] text-muted-foreground truncate">{title}</span>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">via {via}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Empty state */}
      {courseIds.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
          No courses in this semester yet.
        </div>
      )}
    </div>
  );
}
