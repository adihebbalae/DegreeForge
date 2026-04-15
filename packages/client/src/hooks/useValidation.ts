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
      // This is simpler than comparing year/season strings if we assume semesters
      // are comprehensive for the tracked period.
      if (!semesterOrder.includes(c.semester)) {
        priorCourses.push(c.course);
      }
    });
  }

  // Also include in-progress courses if they aren't already in the plan
  // (though in this app, they usually are).
  profile.in_progress_courses.forEach(c => {
    const alreadyInPlan = Object.values(plan).some(courses => courses.includes(c.course));
    if (!alreadyInPlan) {
      // If it's in-progress but not in plan, we might want to know which semester it's in.
      // For simplicity, if it has a semester matching one of ours, add it there.
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

  const { effectivePlan, semesterOrder } = buildEffectivePlan(plan, profile, semesters);
  
  // validatePlan returns an array of violations (one per courseId)
  const allViolations = prereqGraph.validatePlan(effectivePlan, semesterOrder);

  // Filter out violations for courses that are already completed
  const completedIds = new Set(profile?.completed_courses.map(c => c.course) ?? []);
  const violations = allViolations.filter(v => !completedIds.has(v.courseId));

  // Map to Record for O(1) lookup by course card
  const violationsByCourse: Record<string, PrereqViolation> = {};
  violations.forEach(v => {
    violationsByCourse[v.courseId] = v;
  });

  return {
    violations,
    violationsByCourse,
    hasViolations: violations.length > 0,
  };
}
