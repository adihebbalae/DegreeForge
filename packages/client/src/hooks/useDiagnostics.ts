/**
 * useDiagnostics — React hook for TASK-043 "Best Path" diagnostics.
 *
 * Wires together all existing data hooks into a single memoized call
 * to computeDiagnostics. Returns null while data is still loading.
 *
 * Uses the same data-assembly pattern as useRecommendPlan.ts.
 */

import { useMemo } from 'react';
import {
  useDegreeRequirements,
  useTechCoresRecord,
  useMathRequirements,
  useOfferingSchedule,
  useCatalogRecord,
  useDataLoading,
} from '@/context/DataContext';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { useEffectiveProfile } from '@/hooks/useEffectiveProfile';
import { usePlan, useSemesters, useTechCoreId, useMathBAToggle } from '@/context/PlanContext';
import { getCreditHourCap } from '@/lib/auto-planner';
import { computeRemainingRequired, buildSatisfiedSet } from '@/lib/requirements';
import { computeDiagnostics } from '@/lib/diagnostics';
import type { DiagnosticsResult } from '@/lib/diagnostics';

/**
 * Returns diagnostics for the student's current plan, or null while loading.
 *
 * Memoization: re-runs only when the plan, semesters, or underlying data changes.
 * The computation is synchronous and cheap (<1ms for a typical ECE plan).
 */
export function useDiagnostics(): DiagnosticsResult | null {
  const loading = useDataLoading();
  const userProfile = useEffectiveProfile();
  const degreeReqs = useDegreeRequirements();
  const techCoresRecord = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const offeringSchedule = useOfferingSchedule();
  const catalog = useCatalogRecord();
  const prereqGraph = usePrereqGraph();
  const plan = usePlan();
  const semesters = useSemesters();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();

  return useMemo(() => {
    if (loading || !userProfile || !degreeReqs || !techCoresRecord || !mathReqs) return null;

    const techCore = techCoresRecord[techCoreId];
    if (!techCore) return null;

    const satisfied = buildSatisfiedSet(userProfile, degreeReqs, semesters, plan);

    const { required: remainingRequired } = computeRemainingRequired(
      degreeReqs,
      techCore,
      mathReqs,
      mathBAToggle,
      satisfied
    );

    const creditHourCap = getCreditHourCap(userProfile);

    return computeDiagnostics({
      remainingRequired,
      plan,
      semesters,
      prereqGraph,
      catalog: catalog ?? {},
      offeringSchedule,
      creditHourCap,
    });
  }, [
    loading,
    userProfile,
    degreeReqs,
    techCoresRecord,
    mathReqs,
    offeringSchedule,
    catalog,
    prereqGraph,
    plan,
    semesters,
    techCoreId,
    mathBAToggle,
  ]);
}
