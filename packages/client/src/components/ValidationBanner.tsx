import { useMemo, useState } from 'react';
import { AlertTriangle, Wand2, Loader2 } from 'lucide-react';
import { useValidation } from '@/hooks/useValidation';
import { usePlanContext, useSemesters, usePlan } from '@/context/PlanContext';
import { generatePlan } from '@/lib/solver';
import { usePrereqGraph as useRawPrereqGraph, useDegreeRequirements, useTechCoresRecord, useMathRequirements, useUserProfile, useOfferingSchedule } from '@/context/DataContext';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { buildRemainingRequirements } from '@/lib/requirements';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';

export default function ValidationBanner() {
  const { violations, hasViolations } = useValidation();
  const { state, dispatch } = usePlanContext();
  const semesters = useSemesters();
  const plan = usePlan();
  const [isSolving, setIsSolving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [solverError, setSolverError] = useState<string | null>(null);

  // Data needed for solver
  const rawGraph = useRawPrereqGraph();
  const degreeReqs = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const offeringSchedule = useOfferingSchedule();
  const profile = useUserProfile();
  const engineGraph = usePrereqGraph();

  // Compute the live count of future courses and semesters for the confirm copy
  const { futureCourseCount, futureSemesterCount } = useMemo(() => {
    const futureSems = semesters.filter(s => s.status === 'future');
    const courses = futureSems.reduce((sum, s) => sum + (plan[s.id]?.length ?? 0), 0);
    return { futureCourseCount: courses, futureSemesterCount: futureSems.length };
  }, [semesters, plan]);

  const firstViolationId = violations.length > 0 ? violations[0].courseId : null;

  const handleAutoFillConfirmed = () => {
    if (!rawGraph || !degreeReqs || !techCores || !profile) return;

    setIsSolving(true);
    setSolverError(null);

    setTimeout(() => {
      try {
        const remaining = buildRemainingRequirements(
          degreeReqs,
          techCores,
          state.whatIf.techCoreId,
          state.whatIf.mathBAToggle,
          mathReqs,
          profile
        );

        const newPlanOutput = generatePlan({
          completedCourses: [
            ...profile.completed_courses.map(c => c.course),
            ...profile.in_progress_courses.map(c => c.course)
          ],
          remainingRequirements: remaining,
          prereqGraph: engineGraph,
          offeringSchedule: offeringSchedule,
          pinnedCourses: state.pinnedCourses.reduce((acc, courseId) => {
            for (const [semId, courses] of Object.entries(state.plan)) {
              if (courses.includes(courseId)) acc[courseId] = semId;
            }
            return acc;
          }, {} as Record<string, string>),
          maxHoursPerSemester: profile.preferences.course_load === 'Max possible' ? 18 : 17,
          semesters: state.semesters
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
      <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 border-b text-xs transition-colors",
        hasViolations
          ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400"
          : "bg-muted/30 border-border text-muted-foreground"
      )}>
        {hasViolations ? (
          <>
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>
              {violations.length === 1 && firstViolationId
                ? `1 prereq violation — ${firstViolationId} is missing a prerequisite`
                : `${violations.length} prereq violations`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 ml-1 px-2 text-[10px] uppercase font-bold tracking-wider opacity-70 hover:opacity-100"
              onClick={() => {
                const el = document.querySelector(`[data-course-id="${firstViolationId}"]`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              disabled={!firstViolationId}
            >
              Jump to first
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 text-xs gap-1.5"
              onClick={() => setConfirmOpen(true)}
              disabled={isSolving}
            >
              {isSolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Auto-fix
            </Button>
          </>
        ) : (
          <>
            <span className="opacity-70">All prerequisites satisfied</span>
            <div className="flex-1" />
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-7 text-xs gap-1.5"
              onClick={() => setConfirmOpen(true)}
              disabled={isSolving}
            >
              {isSolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
              Auto-Fill Plan
            </Button>
          </>
        )}
      </div>

      {solverError && (
        <div className="px-3 py-2 border-b">
          <Notice
            variant="error"
            message={`Solver could not generate a plan: ${solverError}`}
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
