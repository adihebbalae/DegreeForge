import { useMemo, useState, useEffect, useRef } from 'react';
import { AlertTriangle, Wand2, Loader2, X } from 'lucide-react';
import { useValidation } from '@/hooks/useValidation';
import { track } from '@/lib/analytics';
import { usePlanContext, useSemesters, usePlan } from '@/context/PlanContext';
import { runSolver } from '@/lib/run-solver';
import { useDegreeRequirements, useTechCoresRecord, useMathRequirements, useUserProfile, useOfferingSchedule, useCatalogRecord } from '@/context/DataContext';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import { getCreditHourCap } from '@/lib/auto-planner';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useUi } from '@/context/UiContext';

export default function ValidationBanner() {
  const { violations, hasViolations } = useValidation();
  // TASK-057: separate hard errors from soft past-term info badges
  const hardViolations = violations.filter(v => !v.isSoftWarning);
  const softViolations = violations.filter(v => v.isSoftWarning);
  const { state, dispatch } = usePlanContext();
  const semesters = useSemesters();
  const plan = usePlan();
  const [isSolving, setIsSolving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [solverError, setSolverError] = useState<string | null>(null);
  // Dismissable: the card hides until the violation count next changes, at which
  // point it re-surfaces (a new/different violation is worth re-showing).
  const [dismissed, setDismissed] = useState(false);
  const prevHardCount = useRef(hardViolations.length);
  useEffect(() => {
    if (hardViolations.length !== prevHardCount.current) {
      prevHardCount.current = hardViolations.length;
      setDismissed(false);
    }
  }, [hardViolations.length]);

  const degreeReqs = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const offeringSchedule = useOfferingSchedule();
  const catalog = useCatalogRecord();
  const profile = useUserProfile();
  const effectiveProfile = useEffectiveProfile();
  const engineGraph = usePrereqGraph();
  const { setHighlightedCourseId } = useUi();

  const { futureCourseCount, futureSemesterCount } = useMemo(() => {
    const futureSems = semesters.filter(s => s.status === 'future');
    const courses = futureSems.reduce((sum, s) => sum + (plan[s.id]?.length ?? 0), 0);
    return { futureCourseCount: courses, futureSemesterCount: futureSems.length };
  }, [semesters, plan]);

  const firstViolationId = hardViolations.length > 0 ? hardViolations[0].courseId : null;

  // Fire once per transition into a ≥1-hard-violation state (edge-triggered, not
  // on every re-render) so the event reflects when the banner first surfaces a
  // hard violation rather than every render while it stays shown.
  const hadHardViolations = useRef(false);
  useEffect(() => {
    if (hardViolations.length > 0 && !hadHardViolations.current) {
      hadHardViolations.current = true;
      track('prereq_violations_shown', { count: hardViolations.length });
    } else if (hardViolations.length === 0) {
      hadHardViolations.current = false;
    }
  }, [hardViolations.length]);

  const handleAutoFillConfirmed = () => {
    if (!degreeReqs || !techCores || !profile) return;

    setIsSolving(true);
    setSolverError(null);

    setTimeout(() => {
      try {
        const newPlanOutput = runSolver({
          techCoreId: state.whatIf.techCoreId,
          mathBAToggle: state.whatIf.mathBAToggle,
          degreeReqs,
          techCores,
          mathReqs,
          profile,
          prereqGraph: engineGraph,
          catalog: catalog ?? {},
          offeringSchedule: offeringSchedule,
          pinnedCourseIds: state.pinnedCourses,
          plan: state.plan,
          semesters: state.semesters,
          maxHoursOverride: effectiveProfile ? getCreditHourCap(effectiveProfile) : undefined,
        });

        dispatch({ type: 'SET_PLAN', plan: newPlanOutput.plan });
      } catch (e) {
        console.error('Solver failed:', e);
        setSolverError((e as Error).message);
      } finally {
        setIsSolving(false);
      }
    }, 50);
  };

  const confirmConsequence = futureCourseCount > 0
    ? `Overwrites ${futureCourseCount} course${futureCourseCount === 1 ? '' : 's'} across ${futureSemesterCount} future semester${futureSemesterCount === 1 ? '' : 's'}. Pinned courses are preserved.`
    : `Fills ${futureSemesterCount} future semester${futureSemesterCount === 1 ? '' : 's'} with auto-planned courses. Pinned courses are preserved.`;

  // Nothing to surface when there are no hard violations — render nothing so the
  // top band is reclaimed (the green "all satisfied" / Auto-Fill state is gone;
  // the header's "Recommend" button covers initial plan generation).
  if (!hasViolations || dismissed) {
    // The ConfirmDialog must still be able to close after a successful Auto-fix
    // run that cleared the violations, so keep it mounted while it is open.
    return confirmOpen ? (
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Auto-fix future semesters"
        consequence={confirmConsequence}
        confirmLabel="Overwrite Courses"
        onConfirm={handleAutoFillConfirmed}
      />
    ) : null;
  }

  return (
    <>
      {/* Compact floating toast — fixed to the bottom-right of the viewport so it
          never overlaps the focus-view "Insights · Add · Best Path" tab strip
          (top-right) or the Fall column headers. bottom-[72px] places the card
          just above the fixed "Send feedback" button (~bottom-4 to bottom-14),
          leaving a small gap. z-40 keeps it above planner tiles/panels but below
          the ConfirmDialog modal layer (z-50), so Auto-fix confirm still appears
          on top. shadow-lg provides clear separation from content beneath. */}
      <div
        className={cn(
          "fixed bottom-[72px] right-4 z-40 max-w-[280px] rounded-md border shadow-lg text-[11px]",
          "bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800",
          "text-amber-800 dark:text-amber-300"
        )}
        role="alert"
        data-testid="validation-floating-card"
      >
        <div className="flex items-start gap-1.5 px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          <div className="flex flex-col gap-1 min-w-0">
            <span className="font-medium leading-tight">
              {hardViolations.length === 1 && firstViolationId
                ? `1 prereq violation — ${firstViolationId}`
                : `${hardViolations.length} prereq violations`}
              {softViolations.length > 0 && (
                <span className="opacity-60 ml-1.5 font-normal">
                  + {softViolations.length} past-term info
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              <button
                className="underline underline-offset-2 opacity-90 hover:opacity-100 whitespace-nowrap text-[10px]"
                onClick={() => {
                  if (!firstViolationId) return;
                  setHighlightedCourseId(firstViolationId);
                  // Fallback: in focus-view the CourseCard also carries data-course-id,
                  // so scrollIntoView still works there (no-op in the fixed-height grid).
                  const el = document.querySelector(`[data-course-id="${firstViolationId}"]`);
                  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                disabled={!firstViolationId}
              >
                Jump to first
              </button>
              <Button
                variant="outline"
                size="sm"
                className="h-5 px-2 text-[10px] gap-1 shrink-0"
                onClick={() => setConfirmOpen(true)}
                disabled={isSolving}
              >
                {isSolving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
                Auto-fix
              </Button>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0 -mr-0.5 opacity-70 hover:opacity-100"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss prerequisite violations"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {solverError && (
          <div className="px-2.5 pb-1.5">
            <Notice
              variant="error"
              message={`Solver failed: ${solverError}`}
              action={{ label: 'Retry', onClick: () => { setSolverError(null); setConfirmOpen(true); } }}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Auto-fix future semesters"
        consequence={confirmConsequence}
        confirmLabel="Overwrite Courses"
        onConfirm={handleAutoFillConfirmed}
      />
    </>
  );
}
