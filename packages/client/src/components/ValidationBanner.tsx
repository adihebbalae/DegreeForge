import { useState } from 'react';
import { AlertTriangle, Wand2, Loader2 } from 'lucide-react';
import { useValidation } from '@/hooks/useValidation';
import { usePlanContext } from '@/context/PlanContext';
import { generatePlan } from '@/lib/solver';
import { usePrereqGraph as useRawPrereqGraph, useDegreeRequirements, useTechCoresRecord, useMathRequirements, useUserProfile, useOfferingSchedule } from '@/context/DataContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildRemainingRequirements } from '@/lib/requirements';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';

export default function ValidationBanner() {
  const { violations, hasViolations } = useValidation();
  const { state, dispatch } = usePlanContext();
  const [isSolving, setIsSolving] = useState(false);

  // Data needed for solver
  const rawGraph = useRawPrereqGraph();
  const degreeReqs = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const offeringSchedule = useOfferingSchedule();
  const profile = useUserProfile();
  const engineGraph = usePrereqGraph();

  const handleAutoFill = () => {
    if (!rawGraph || !degreeReqs || !techCores || !profile) return;

    if (!window.confirm('This will overwrite all courses in future semesters. Are you sure?')) {
      return;
    }

    setIsSolving(true);

    // Give UI a tick to render loading state
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
        alert('Failed to generate plan: ' + (e as Error).message);
      } finally {
        setIsSolving(false);
      }
    }, 50);
  };

  return (
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
            {violations.length} prerequisite issue{violations.length === 1 ? '' : 's'} in your plan
          </span>
          <span className="ml-auto text-[10px] uppercase font-bold tracking-wider opacity-70">
            Review red/orange cards
          </span>
        </>
      ) : (
        <span className="opacity-70">All prerequisites satisfied</span>
      )}

      <div className={cn("flex-1", hasViolations && "hidden")} />
      
      {!hasViolations && (
        <Button 
          variant="outline" 
          size="sm" 
          className="ml-auto h-7 text-xs gap-1.5"
          onClick={handleAutoFill}
          disabled={isSolving}
        >
          {isSolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
          Auto-Fill Plan
        </Button>
      )}
    </div>
  );
}
