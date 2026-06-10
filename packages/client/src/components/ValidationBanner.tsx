import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Wand2, Loader2 } from 'lucide-react';
import { useValidation } from '@/hooks/useValidation';
import { usePlanContext, useSemesters, usePlan } from '@/context/PlanContext';
import { runSolver } from '@/lib/run-solver';
import { useDegreeRequirements, useTechCoresRecord, useMathRequirements, useUserProfile, useOfferingSchedule } from '@/context/DataContext';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import { getCreditHourCap } from '@/lib/auto-planner';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';

export default function ValidationBanner() {
  const { violations, hasViolations } = useValidation();
  const { state, dispatch } = usePlanContext();
  const semesters = useSemesters();
  const plan = usePlan();
  const [isSolving, setIsSolving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [solverError, setSolverError] = useState<string | null>(null);

  const degreeReqs = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const offeringSchedule = useOfferingSchedule();
  const profile = useUserProfile();
  const effectiveProfile = useEffectiveProfile();
  const engineGraph = usePrereqGraph();

  const { futureCourseCount, futureSemesterCount } = useMemo(() => {
    const futureSems = semesters.filter(s => s.status === 'future');
    const courses = futureSems.reduce((sum, s) => sum + (plan[s.id]?.length ?? 0), 0);
    return { futureCourseCount: courses, futureSemesterCount: futureSems.length };
  }, [semesters, plan]);

  const firstViolationId = violations.length > 0 ? violations[0].courseId : null;

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

  return (
    <>
      {/* Single-line chip row — height ~28px */}
      <div className={cn(
        "flex items-center gap-1.5 px-3 border-b text-[11px] transition-colors",
        hasViolations
          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
          : "bg-muted/30 border-border text-muted-foreground"
      )} style={{ height: '28px' }}>
        {hasViolations ? (
          <>
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {violations.length === 1 && firstViolationId
                ? `1 prereq violation — ${firstViolationId}`
                : `${violations.length} prereq violations`}
            </span>
            <button
              className="underline underline-offset-2 opacity-80 hover:opacity-100 whitespace-nowrap text-[10px] shrink-0"
              onClick={() => {
                const el = document.querySelector(`[data-course-id="${firstViolationId}"]`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              disabled={!firstViolationId}
            >
              Jump to first
            </button>
            <div className="flex-1" />
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
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600 dark:text-green-400" />
            <span className="opacity-70">All prerequisites satisfied</span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-2 text-[10px] gap-1 shrink-0"
              onClick={() => setConfirmOpen(true)}
              disabled={isSolving}
            >
              {isSolving ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
              Auto-Fill
            </Button>
          </>
        )}
      </div>

      {solverError && (
        <div className="px-3 py-1 border-b">
          <Notice
            variant="error"
            message={`Solver failed: ${solverError}`}
            action={{ label: 'Retry', onClick: () => { setSolverError(null); setConfirmOpen(true); } }}
          />
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Auto-fill future semesters"
        consequence={confirmConsequence}
        confirmLabel="Overwrite Courses"
        onConfirm={handleAutoFillConfirmed}
      />
    </>
  );
}
