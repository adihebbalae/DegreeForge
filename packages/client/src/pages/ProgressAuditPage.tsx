/**
 * ProgressAuditPage — TASK-098
 *
 * The FR-4 radial + requirement-cards page.
 *
 * Extracted from ProgressPage.tsx so that both ProgressPage (direct nav) and
 * ProgressReveal (upload reward path) can import it from a single location —
 * previously ProgressPage imported ProgressReveal, which imported ProgressAuditPage
 * back from ProgressPage, forming a circular dependency.
 */

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, ArrowRight, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { usePlan, useTechCoreId, useMathBAToggle, useWhatIf } from '@/context/PlanContext';
import {
  useCatalogRecord,
  useDegreeRequirements,
  useUserProfile,
  useTechCoresRecord,
} from '@/context/DataContext';
import { computeProgress } from '@/lib/progress';
import { CATEGORY_BG } from '@/lib/course-utils';
import { computeUtGpa } from '@/lib/gpa';
import { cn } from '@/lib/utils';
import { track } from '@/lib/analytics';
import { DegreeRadial } from '@/components/DegreeRadial';
import { RequirementCards } from '@/components/RequirementCards';
import type { BucketView } from '@/types';

// ─── Context wiring ───────────────────────────────────────────────────────────

function useProgressData() {
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

  return useMemo(() => {
    if (!catalog || !degreeReqs || !profile || !techCores) return null;
    const techCore = techCores[techCoreId];
    if (!techCore) return null;
    return computeProgress(plan, profile, catalog, degreeReqs, techCore, mathBAToggle);
  }, [plan, catalog, degreeReqs, profile, techCores, techCoreId, mathBAToggle]);
}

// ─── Legend row ───────────────────────────────────────────────────────────────

function LegendRow({ bucket }: { bucket: BucketView }) {
  const pct =
    bucket.totalHours > 0
      ? Math.min(100, Math.round((bucket.doneHours / bucket.totalHours) * 100))
      : 0;

  const label =
    bucket.doneCount !== undefined && bucket.totalCount !== undefined &&
    bucket.countNoun === 'slots'
      ? `${bucket.doneHours}/${bucket.totalHours} hrs (${bucket.doneCount}/${bucket.totalCount})`
      : `${bucket.doneHours}/${bucket.totalHours} hrs${bucket.complete ? ' ✓' : ''}`;

  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 text-[12.5px]">
      {/* Color dot */}
      <span
        className={cn('h-2.5 w-2.5 rounded-full flex-none', CATEGORY_BG[bucket.category])}
        aria-hidden="true"
      />
      <span className="font-medium text-foreground truncate">{bucket.label}</span>
      <span className="tabular-nums text-muted-foreground whitespace-nowrap">{label}</span>
      {/* Mini bar (spans full row) */}
      <div className="col-span-3 -mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full', CATEGORY_BG[bucket.category])}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── ProgressAuditPage ────────────────────────────────────────────────────────

export function ProgressAuditPage() {
  const navigate = useNavigate();
  const progress = useProgressData();
  const profile = useUserProfile();

  // Computed UT GPA — local only, never transmitted to analytics.
  // PRIVACY: Do NOT add this value to any track() call.
  const computedGpa = useMemo(
    () => computeUtGpa(profile?.completed_courses ?? []),
    [profile?.completed_courses]
  );

  if (!progress) {
    return (
      <div
        className="mx-auto w-full max-w-5xl px-6 py-8"
        data-testid="progress-audit-loading"
      >
        {/* Hero skeleton */}
        <div className="mb-8 flex flex-col items-center gap-6 lg:flex-row lg:items-start">
          <div className="h-[220px] w-[220px] animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-32 animate-pulse rounded bg-muted" />
                <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
        {/* Cards skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  const { buckets, totalHours, totalHoursTarget } = progress;
  const pct = totalHoursTarget > 0
    ? Math.min(100, Math.round((totalHours / totalHoursTarget) * 100))
    : 0;
  const hrsToGo = Math.max(0, totalHoursTarget - totalHours);

  // Estimate semesters remaining (rough: ~15 hrs/semester)
  const semsToGo = hrsToGo > 0 ? Math.ceil(hrsToGo / 15) : 0;

  const handlePlanAction = () => {
    track('progress_audit_plan_action');
    navigate('/plan');
  };

  return (
    <div
      className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8"
      data-testid="progress-audit-page"
    >
      {/* Page title */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            BSECE Degree Audit
          </h1>
        </div>
      </div>

      {/* Hero band: radial left + legend right */}
      <div className="mb-8 flex flex-col items-center gap-6 lg:flex-row lg:items-start">
        {/* Radial — centered on mobile, left-aligned on desktop */}
        <div className="flex-none flex justify-center">
          <DegreeRadial
            buckets={buckets}
            pct={pct}
            done={totalHours}
            total={totalHoursTarget}
            hrsToGo={hrsToGo}
            size={220}
          />
        </div>

        {/* Legend + status line */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex flex-col gap-2.5">
            {buckets.map((b) => (
              <LegendRow key={b.id} bucket={b} />
            ))}
          </div>

          {/* Status line */}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px] text-muted-foreground">
            {hrsToGo > 0 ? (
              <>
                <span className="font-semibold text-[hsl(18_58%_50%)]">
                  ⚠ {hrsToGo} hrs to go
                </span>
                {semsToGo > 0 && (
                  <span>· ~{semsToGo} semester{semsToGo === 1 ? '' : 's'}</span>
                )}
              </>
            ) : (
              <span className="font-semibold text-[hsl(85_50%_42%)]">
                ✓ All hours satisfied
              </span>
            )}
          </p>

          {/* UT GPA stat — computed locally from in-residence letter grades only */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 self-start">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                UT GPA
              </span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="About UT GPA"
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <HelpCircle className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-xs leading-snug">
                    In-residence letter grades only. Transfer, AP, and credit-by-exam are excluded per UT policy.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {computedGpa.gpa !== null ? (
              <span className="text-base font-bold tabular-nums text-foreground">
                {computedGpa.gpa.toFixed(2)}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground italic">No letter grades yet</span>
            )}
          </div>

          {/* Quick action button */}
          <Button
            size="sm"
            onClick={handlePlanAction}
            className="mt-1 gap-2 self-start"
          >
            View full plan
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Requirement cards */}
      <RequirementCards buckets={buckets} />
    </div>
  );
}
