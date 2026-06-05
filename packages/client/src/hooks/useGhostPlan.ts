import { useEffect, useMemo } from 'react';
import { generatePlan } from '@/lib/solver';
import { buildRemainingRequirements } from '@/lib/requirements';
import { useOfferingSchedule, useUserProfile, useDegreeRequirements, useTechCoresRecord, useMathRequirements } from '@/context/DataContext';
import { usePrereqGraph } from '@/hooks/usePrereqGraph';
import { usePlan, usePinnedCourses, useRejectedGhosts, useSemesters, usePlanDispatch, useTechCoreId, useMathBAToggle } from '@/context/PlanContext';

/**
 * TASK-019: Ghost-plan hook.
 *
 * When the user has ≥1 pinned course, runs the constraint solver in the
 * background and dispatches SET_GHOST_COURSES with any solver-proposed
 * courses that are NOT yet in the user's real plan.
 *
 * When pins are cleared, dispatches DISMISS_GHOSTS.
 */
export function useGhostPlan(): void {
  const dispatch = usePlanDispatch();
  const plan = usePlan();
  const pins = usePinnedCourses();
  const rejectedGhosts = useRejectedGhosts();
  const semesters = useSemesters();

  const prereqGraph = usePrereqGraph();
  const offeringSchedule = useOfferingSchedule();
  const profile = useUserProfile();
  const degreeReqs = useDegreeRequirements();
  const techCores = useTechCoresRecord();
  const mathReqs = useMathRequirements();
  const techCoreId = useTechCoreId();
  const mathBA = useMathBAToggle();

  // Build the pinned map: courseId → semesterId (from where it currently lives in the plan)
  const pinnedMap = useMemo((): Record<string, string> => {
    const map: Record<string, string> = {};
    for (const courseId of pins) {
      for (const [semId, courses] of Object.entries(plan)) {
        if (courses.includes(courseId)) {
          map[courseId] = semId;
          break;
        }
      }
    }
    return map;
  }, [pins, plan]);

  // Flat set of course IDs already in the user's plan (real placements)
  const placedCourseIds = useMemo(
    () => new Set(Object.values(plan).flat()),
    [plan]
  );

  useEffect(() => {
    if (pins.length === 0) {
      dispatch({ type: 'DISMISS_GHOSTS' });
      return;
    }

    if (!profile || !degreeReqs || !techCores) return;

    const completedCourses = [
      ...profile.completed_courses.map((c) => c.course),
      ...profile.in_progress_courses.map((c) => c.course),
    ];

    const remainingRequirements = buildRemainingRequirements(
      degreeReqs,
      techCores,
      techCoreId,
      mathBA,
      mathReqs,
      profile
    ).filter((id) => !rejectedGhosts.includes(id));

    const result = generatePlan({
      completedCourses,
      remainingRequirements,
      prereqGraph,
      offeringSchedule,
      pinnedCourses: pinnedMap,
      maxHoursPerSemester: profile.preferences?.course_load_tolerance === 'heavy' ? 19
        : profile.preferences?.course_load_tolerance === 'light' ? 15
        : 17,
      semesters,
      existingPlan: plan,
      degreeReqs,
    });

    // Ghost courses = solver proposed placements that are NOT in the user's real plan
    const ghostCourses: Record<string, string[]> = {};
    for (const [semId, courseIds] of Object.entries(result.plan)) {
      const newGhosts = courseIds.filter((id) => !placedCourseIds.has(id));
      if (newGhosts.length > 0) {
        ghostCourses[semId] = newGhosts;
      }
    }

    dispatch({ type: 'SET_GHOST_COURSES', ghostCourses });
  }, [
    pins,
    pinnedMap,
    rejectedGhosts,
    placedCourseIds,
    prereqGraph,
    offeringSchedule,
    profile,
    degreeReqs,
    techCores,
    mathReqs,
    techCoreId,
    mathBA,
    semesters,
    dispatch,
  ]);
}
