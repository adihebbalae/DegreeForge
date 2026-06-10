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
  useUserProfile,
  useDegreeRequirements,
  useTechCoresRecord,
  useMathRequirements,
  useOfferingSchedule,
  useDataLoading,
} from '@/context/DataContext';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { usePlan, useSemesters, useTechCoreId, useMathBAToggle } from '@/context/PlanContext';
import { useSettings } from '@/context/SettingsContext';
import { computeRequiredCourses, getCreditHourCap } from '@/lib/auto-planner';
import { computeDiagnostics } from '@/lib/diagnostics';
import { addWithVariants } from '@/lib/variants';
import type { DiagnosticsResult } from '@/lib/diagnostics';

/**
 * Returns diagnostics for the student's current plan, or null while loading.
 *
 * Memoization: re-runs only when the plan, semesters, or underlying data changes.
 * The computation is synchronous and cheap (<1ms for a typical ECE plan).
 */
export function useDiagnostics(): DiagnosticsResult | null {
  const loading = useDataLoading();
  const userProfile = useUserProfile();
  const degreeReqs = useDegreeRequirements();
  const techCoresRecord = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const offeringSchedule = useOfferingSchedule();
  const prereqGraph = usePrereqGraph();
  const plan = usePlan();
  const semesters = useSemesters();
  const techCoreId = useTechCoreId();
  const mathBAToggle = useMathBAToggle();
  // Read loadTolerance from SettingsContext — this is the value the user selected
  // in onboarding/settings. The userProfile.preferences.course_load_tolerance field
  // is never updated after initial load, so using it would return a stale/default cap.
  const { loadTolerance } = useSettings();

  return useMemo(() => {
    if (loading || !userProfile || !degreeReqs || !techCoresRecord || !mathReqs) return null;

    const techCore = techCoresRecord[techCoreId];
    if (!techCore) return null;

    // Build the variant-expanded satisfied set (same logic as generateAutoPlan)
    const satisfied = new Set<string>();
    for (const c of userProfile.completed_courses) addWithVariants(satisfied, c.course, degreeReqs);
    for (const c of userProfile.in_progress_courses) addWithVariants(satisfied, c.course, degreeReqs);
    for (const sem of semesters) {
      if (sem.status === 'past' || sem.status === 'current') {
        for (const c of plan[sem.id] ?? []) addWithVariants(satisfied, c, degreeReqs);
      }
    }

    const { required: remainingRequired } = computeRequiredCourses(
      degreeReqs,
      techCore,
      mathReqs,
      mathBAToggle,
      satisfied
    );

    // Build a synthetic profile that reflects the user's current settings tolerance,
    // so getCreditHourCap returns the correct value for the selected load tolerance.
    const profileWithTolerance = {
      ...userProfile,
      preferences: { ...userProfile.preferences, course_load_tolerance: loadTolerance },
    };
    const creditHourCap = getCreditHourCap(profileWithTolerance);

    return computeDiagnostics({
      remainingRequired,
      plan,
      semesters,
      prereqGraph,
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
    prereqGraph,
    plan,
    semesters,
    techCoreId,
    mathBAToggle,
    loadTolerance,
  ]);
}
