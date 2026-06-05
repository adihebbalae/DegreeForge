/**
 * run-solver.ts
 *
 * D4: Shared helper that builds remaining requirements and invokes generatePlan.
 * Used by ValidationBanner (auto-fill) and WhatIfPanel (apply) to eliminate the
 * ~40 lines of duplicated setup in both components.
 */

import { generatePlan, type SolverOutput } from './solver';
import { buildRemainingRequirements } from './requirements';
import { PrereqGraph } from './graph-engine';
import type {
  DegreeRequirements,
  TechCores,
  MathRequirements,
  UserProfile,
  OfferingSchedule,
  Plan,
  Semester,
} from '../types';

export interface RunSolverParams {
  /** Which tech-core track to plan for */
  techCoreId: string;
  /** Whether Math BA requirements are included */
  mathBAToggle: boolean;
  degreeReqs: DegreeRequirements;
  techCores: TechCores;
  mathReqs: MathRequirements | null;
  profile: UserProfile;
  prereqGraph: PrereqGraph;
  offeringSchedule: OfferingSchedule;
  /** Pinned courses array (from PlanContext state.pinnedCourses) */
  pinnedCourseIds: string[];
  /** Full plan used to resolve pinned-course → semester mapping */
  plan: Plan;
  semesters: Semester[];
}

/**
 * Build remaining requirements and run the constraint solver.
 *
 * Returns the full SolverOutput so callers can dispatch SET_PLAN and
 * surface unplacedCourses if needed.
 */
export function runSolver(params: RunSolverParams): SolverOutput {
  const {
    techCoreId,
    mathBAToggle,
    degreeReqs,
    techCores,
    mathReqs,
    profile,
    prereqGraph,
    offeringSchedule,
    pinnedCourseIds,
    plan,
    semesters,
  } = params;

  const remaining = buildRemainingRequirements(
    degreeReqs,
    techCores,
    techCoreId,
    mathBAToggle,
    mathReqs,
    profile
  );

  const pinnedCourses: Record<string, string> = {};
  for (const courseId of pinnedCourseIds) {
    for (const [semId, courses] of Object.entries(plan)) {
      if (courses.includes(courseId)) {
        pinnedCourses[courseId] = semId;
        break;
      }
    }
  }

  const maxHoursPerSemester =
    profile.preferences?.course_load === 'Max possible' ? 18 : 17;

  return generatePlan({
    completedCourses: [
      ...profile.completed_courses.map((c) => c.course),
      ...profile.in_progress_courses.map((c) => c.course),
    ],
    remainingRequirements: remaining,
    prereqGraph,
    offeringSchedule,
    pinnedCourses,
    maxHoursPerSemester,
    semesters,
    existingPlan: plan,
  });
}
