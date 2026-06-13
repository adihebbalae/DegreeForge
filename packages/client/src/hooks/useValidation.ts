import { useMemo } from 'react';
import { usePlanContext } from '../context/PlanContext';
import { usePrereqGraph } from './usePrereqGraph';
import { useUserProfile, useDegreeRequirements } from '../context/DataContext';
import { buildSatisfiedSet } from '../lib/requirements';
import type { PrereqGraph } from '../lib/graph-engine';
import type { DegreeRequirements, Plan, PrereqViolation, Semester, UserProfile } from '../types';

export interface ValidationResult {
  violations: PrereqViolation[];
  violationsByCourse: Record<string, PrereqViolation>;
  hasViolations: boolean;
}

/**
 * Merges the user's in-progress courses into the displayed plan so they appear
 * as placements to validate. Completed/in-progress credit is NOT folded in here —
 * that is supplied to the validator via the canonical satisfied set (buildSatisfiedSet),
 * which is the single source of truth for "what the student has taken" and counts every
 * transcript course regardless of which semester it sits in or whether that semester is
 * displayed. This avoids the phantom-violation bug where a completion in a displayed
 * past semester (with an empty plan slot) was invisible to the prereq checker.
 */
function buildEffectivePlan(plan: Plan, profile: UserProfile | null, semesters: Semester[]): { effectivePlan: Plan, semesterOrder: string[] } {
  const effectivePlan: Plan = { ...plan };
  const semesterOrder = semesters.map(s => s.id);

  if (!profile) return { effectivePlan, semesterOrder };

  // Include in-progress courses as placements if they aren't already in the plan,
  // so they show up and get validated in their displayed semester.
  profile.in_progress_courses.forEach(c => {
    const alreadyInPlan = Object.values(plan).some(courses => courses.includes(c.course));
    if (!alreadyInPlan && semesterOrder.includes(c.semester)) {
      effectivePlan[c.semester] = [...(effectivePlan[c.semester] || []), c.course];
    }
  });

  return { effectivePlan, semesterOrder };
}

/**
 * Pure validation computation — exported so the same wiring the hook runs can be
 * tested against real data without mounting React. Builds the effective plan,
 * seeds the validator with the canonical satisfied set, filters completed courses,
 * and tags past-term gaps as soft warnings.
 */
export function computeValidation(
  plan: Plan,
  semesters: Semester[],
  prereqGraph: PrereqGraph,
  profile: UserProfile | null,
  degreeReqs: DegreeRequirements | null
): ValidationResult {
  const { effectivePlan, semesterOrder } = buildEffectivePlan(plan, profile, semesters);

  // Canonical satisfied set (Theme-F single source of truth): every completed and
  // in-progress transcript course, variant-expanded through the equivalence registry.
  // Seeds the validator's "before" set so a real completion is never read as missing,
  // regardless of which semester it sits in. We deliberately do NOT include planned-future
  // courses — the per-semester accumulation in validatePlan still enforces plan ordering,
  // so genuine "scheduled after its dependent" violations are preserved.
  const satisfiedSet = (profile && degreeReqs)
    ? buildSatisfiedSet(profile, degreeReqs)
    : undefined;

  // validatePlan returns an array of violations (one per courseId)
  const allViolations = prereqGraph.validatePlan(effectivePlan, semesterOrder, satisfiedSet);

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
}

export function useValidation(): ValidationResult {
  const { state } = usePlanContext();
  const { plan, semesters } = state;
  const prereqGraph = usePrereqGraph();
  const profile = useUserProfile();
  const degreeReqs = useDegreeRequirements();

  // Memoize the full validation computation — only reruns when plan, semesters,
  // prereqGraph, profile, or degreeReqs changes. Avoids re-running validatePlan on every render.
  return useMemo<ValidationResult>(
    () => computeValidation(plan, semesters, prereqGraph, profile, degreeReqs),
    [plan, semesters, prereqGraph, profile, degreeReqs]
  );
}
