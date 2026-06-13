/**
 * usePlanOptimizeSummary — TASK-068
 *
 * Live readout of the fastest↔easiest tradeoff for the "Recommend Plan" action.
 *
 * For BOTH modes it runs the deterministic solver in-memory over the current
 * profile/requirements (the same way useGhostPlan previews placements) and
 * summarizes each candidate plan's aggregate difficulty, expected GPA, and
 * graduation term. The Header surfaces the summary for the currently-selected
 * mode, so toggling fastest↔easiest updates the readout immediately — before the
 * user commits the plan — and the GPA-not-speed tradeoff (easiest may defer the
 * graduation term) is visible, not hidden.
 *
 * Pure data assembly + memoization; the objective math lives in plan-objective.ts.
 */

import { useMemo } from 'react';
import {
  useDegreeRequirements,
  useTechCoresRecord,
  useMathRequirements,
  useCatalogRecord,
  useOfferingSchedule,
} from '@/context/DataContext';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import {
  useSemesters,
  usePlan,
  usePinnedCourses,
  useTechCoreId,
  useMathBAToggle,
} from '@/context/PlanContext';
import { runSolver } from '@/lib/run-solver';
import { getCourseCredits } from '@/lib/course-utils';
import { summarizePlanDifficulty, type PlanDifficultySummary } from '@/lib/plan-objective';
import type { OptimizeMode } from '@/lib/solver';

export interface PlanOptimizeSummaries {
  fastest: PlanDifficultySummary;
  easiest: PlanDifficultySummary;
}

/**
 * Returns the difficulty/GPA/grad-term summary for both optimization modes, or
 * null while course data is still loading.
 */
export function usePlanOptimizeSummary(): PlanOptimizeSummaries | null {
  const profile = useEffectiveProfile();
  const degreeReqs = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();
  const semesters = useSemesters();
  const plan = usePlan();
  const pinnedCourses = usePinnedCourses();
  const catalog = useCatalogRecord();
  const prereqGraph = usePrereqGraph();
  const offeringSchedule = useOfferingSchedule();

  return useMemo(() => {
    if (!profile || !degreeReqs || !techCores || !mathReqs) return null;

    const resolveCredits = (id: string) => getCourseCredits(id, catalog ?? {});

    const summarize = (optimize: OptimizeMode): PlanDifficultySummary => {
      const result = runSolver({
        techCoreId,
        mathBAToggle,
        degreeReqs,
        techCores,
        mathReqs,
        profile,
        prereqGraph,
        catalog: catalog ?? {},
        offeringSchedule,
        pinnedCourseIds: pinnedCourses,
        plan,
        semesters,
        optimize,
      });
      return summarizePlanDifficulty(result.plan, semesters, resolveCredits);
    };

    return { fastest: summarize('fastest'), easiest: summarize('easiest') };
  }, [
    profile,
    degreeReqs,
    techCores,
    mathReqs,
    techCoreId,
    mathBAToggle,
    semesters,
    plan,
    pinnedCourses,
    catalog,
    prereqGraph,
    offeringSchedule,
  ]);
}
