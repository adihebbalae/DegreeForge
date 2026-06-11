import { useMemo } from 'react';
import { usePlanContext } from '../context/PlanContext';
import { usePrereqGraph } from './usePrereqGraph';
import { useUserProfile } from '../context/DataContext';
import type { Plan, PrereqViolation, Semester, UserProfile } from '../types';

export interface ValidationResult {
  violations: PrereqViolation[];
  violationsByCourse: Record<string, PrereqViolation>;
  hasViolations: boolean;
}

const PRIOR_CREDIT_ID = 'PRIOR_CREDIT';

/**
 * Merges the user's plan with their completed and in-progress courses
 * into a single unified plan for validation.
 */
function buildEffectivePlan(plan: Plan, profile: UserProfile | null, semesters: Semester[]): { effectivePlan: Plan, semesterOrder: string[] } {
  const effectivePlan: Plan = { ...plan };
  const semesterOrder = semesters.map(s => s.id);

  if (!profile) return { effectivePlan, semesterOrder };

  // Identify courses taken BEFORE the first semester in our timeline
  const firstSemester = semesters[0];
  const priorCourses: string[] = [];

  if (firstSemester) {
    profile.completed_courses.forEach(c => {
      // If the course is NOT in any of our displayed semesters, it's prior credit.
      if (!semesterOrder.includes(c.semester)) {
        priorCourses.push(c.course);
      }
    });
  }

  // Also include in-progress courses if they aren't already in the plan
  profile.in_progress_courses.forEach(c => {
    const alreadyInPlan = Object.values(plan).some(courses => courses.includes(c.course));
    if (!alreadyInPlan) {
      if (semesterOrder.includes(c.semester)) {
        effectivePlan[c.semester] = [...(effectivePlan[c.semester] || []), c.course];
      }
    }
  });

  if (priorCourses.length > 0) {
    // Deduplicate in case a prior course is somehow also in the plan
    const uniquePrior = priorCourses.filter(id => !Object.values(plan).some(courses => courses.includes(id)));
    if (uniquePrior.length > 0) {
      effectivePlan[PRIOR_CREDIT_ID] = uniquePrior;
      semesterOrder.unshift(PRIOR_CREDIT_ID);
    }
  }

  return { effectivePlan, semesterOrder };
}

export function useValidation(): ValidationResult {
  const { state } = usePlanContext();
  const { plan, semesters } = state;
  const prereqGraph = usePrereqGraph();
  const profile = useUserProfile();

  // Memoize the full validation computation — only reruns when plan, semesters,
  // prereqGraph, or profile changes. Avoids re-running validatePlan on every render.
  const result = useMemo<ValidationResult>(() => {
    const { effectivePlan, semesterOrder } = buildEffectivePlan(plan, profile, semesters);

    // validatePlan returns an array of violations (one per courseId)
    const allViolations = prereqGraph.validatePlan(effectivePlan, semesterOrder);

    // Filter out violations for courses that are already completed
    const completedIds = new Set(profile?.completed_courses.map(c => c.course) ?? []);
    const rawViolations = allViolations.filter(v => !completedIds.has(v.courseId));

    // Build a semesterId → status map for past-term fade (TASK-057).
    // A course in a "past" semester with an unmet prereq gets isSoftWarning=true,
    // surfacing as an info badge rather than a hard red error.
    const semesterStatusMap = new Map<string, 'past' | 'current' | 'future'>(
      semesters.map(s => [s.id, s.status])
    );

    const violations: PrereqViolation[] = rawViolations.map(v => {
      const semStatus = semesterStatusMap.get(v.semesterId);
      return semStatus === 'past'
        ? { ...v, isSoftWarning: true }
        : v;
    });

    // Map to Record for O(1) lookup by course card
    const violationsByCourse: Record<string, PrereqViolation> = {};
    violations.forEach(v => {
      violationsByCourse[v.courseId] = v;
    });

    // Only count hard violations (not soft warnings) for hasViolations — drives the
    // banner color and auto-fill prompt, which shouldn't fire for historical gaps.
    const hardViolations = violations.filter(v => !v.isSoftWarning);

    return {
      violations,
      violationsByCourse,
      hasViolations: hardViolations.length > 0,
    };
  }, [plan, semesters, prereqGraph, profile]);

  return result;
}
