/**
 * solver.ts
 *
 * Deterministic constraint solver / recommendation engine (TASK-004).
 * Generates a valid semester-by-semester degree plan using greedy
 * topological-sort placement.
 *
 * Pure TypeScript — no React, no LLM calls, no randomness.
 * Same input always produces the same output.
 */

import type {
  Plan,
  Semester,
  OfferingSchedule,
  PrereqViolation,
  DegreeRequirements,
} from '../types';
import { PrereqGraph } from './graph-engine';
import { expandVariants, isInSameOrPriorSemester, addWithVariants } from './variants';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SolverInput {
  /** Courses already completed or in-progress (treated as done) */
  completedCourses: string[];
  /** Flat list of all remaining required course IDs */
  remainingRequirements: string[];
  /** PrereqGraph instance from TASK-003 */
  prereqGraph: PrereqGraph;
  /** Offering schedule from offering-schedule.json */
  offeringSchedule: OfferingSchedule;
  /** Pinned courses: courseId → semesterId (locked in place) */
  pinnedCourses: Record<string, string>;
  /** Maximum credit hours per semester (default 17) */
  maxHoursPerSemester: number;
  /** Ordered list of semester objects (from PlanContext SEMESTERS) */
  semesters: Semester[];
  /** Optional: The existing visual plan to preserve past/current placements */
  existingPlan?: Plan;
  /**
   * Optional: degree requirements, used to enable variant-aware prereq/coreq
   * checking (e.g. ECE 312H satisfies the ECE 312 prereq edge).
   * When omitted the solver falls back to exact-ID matching (original behavior).
   */
  degreeReqs?: DegreeRequirements;
}

export interface SolverOutput {
  /** semesterId → courseId[] */
  plan: Plan;
  /** Ordered list of semester IDs in the plan */
  semesterOrder: string[];
  /** Prerequisite violations (should be empty for a valid output) */
  violations: PrereqViolation[];
  /** Credit hours per semester */
  totalHours: Record<string, number>;
  /** Courses that couldn't be placed in any semester */
  unplacedCourses: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Check if a course can be offered in a given semester season.
 * Uses the `offered_semesters` array from offering-schedule.json.
 *
 * Rules:
 * - Unknown course (not in schedule) → assume available (true)
 * - Empty or missing offered_semesters → assume available (true)
 * - ["fall"] → only Fall semesters (false for spring AND summer)
 * - ["spring"] → only Spring semesters (false for fall AND summer)
 * - ["fall", "spring"] → available in fall and spring, but NOT summer
 * - Summer requires "summer" to appear explicitly in offered_semesters (opt-in only)
 *
 * The final `offeredSemesters.includes(season)` handles all cases correctly.
 * The old "if fall+spring → always true" shortcut was redundant for fall/spring
 * and WRONG for summer: it caused fall+spring-only courses (e.g. ECE 313) to be
 * incorrectly treated as summer-placeable.
 *
 * Exported so auto-planner can use the same offering source (Behavior A unification).
 */
export function canOfferInSemester(
  courseId: string,
  semester: Semester,
  offeringSchedule: OfferingSchedule
): boolean {
  const entry = offeringSchedule[courseId];
  if (!entry) return true; // Unknown course → assume available

  const offeredSemesters = entry.offered_semesters;
  if (!offeredSemesters || offeredSemesters.length === 0) return true;

  const season = semester.season.toLowerCase();
  return offeredSemesters.includes(season);
}

/**
 * Get future semesters only (status !== 'past' and status !== 'current').
 * Past and current semesters are pre-populated from transcript.
 */
function getFutureSemesters(semesters: Semester[]): Semester[] {
  return semesters.filter((s) => s.status === 'future');
}

// ─── Main solver ──────────────────────────────────────────────────────────────

/**
 * Generate a degree plan by greedily placing courses in topological order
 * into the earliest valid semester.
 *
 * Algorithm:
 * 1. Build the set of "already completed" courses
 * 2. Topological sort the remaining requirements
 * 3. Place pinned courses first in their fixed semesters
 * 4. For each remaining course (in topo order):
 *    - Find the earliest future semester where:
 *      a) All prereqs are in earlier semesters or already completed
 *      b) The course is offered that semester (fall/spring check)
 *      c) Adding it doesn't exceed maxHoursPerSemester
 *    - If no valid semester found → add to unplacedCourses
 * 5. Validate the final plan
 * 6. Return SolverOutput
 */
export function generatePlan(input: SolverInput): SolverOutput {
  const {
    completedCourses,
    remainingRequirements,
    prereqGraph,
    offeringSchedule,
    pinnedCourses,
    maxHoursPerSemester,
    semesters,
    existingPlan,
    degreeReqs,
  } = input;

  // When degreeReqs is provided, build a variant-expanded satisfied set so that
  // ECE 312H satisfies any prereq edge that names ECE 312, ECE 412, etc.
  // Without degreeReqs, fall back to exact-ID matching (original behavior).
  const completedSet: Set<string> = degreeReqs
    ? (() => {
        const s = new Set<string>();
        for (const c of completedCourses) addWithVariants(s, c, degreeReqs);
        return s;
      })()
    : new Set(completedCourses);

  // Variant function used in plan-placement checks (no-op when no degreeReqs)
  const variants = degreeReqs
    ? (id: string) => expandVariants(id, degreeReqs)
    : (_id: string): string[] => [];
  const futureSemesters = getFutureSemesters(semesters);
  const semesterOrder = semesters.map((s) => s.id);

  // Initialize plan: preserve existing for past/current, clear future
  const plan: Plan = {};
  for (const sem of semesters) {
    if (sem.status !== 'future' && existingPlan) {
      plan[sem.id] = [...(existingPlan[sem.id] || [])];
    } else {
      plan[sem.id] = [];
    }
  }

  // Track credit hours per semester (only track for future semesters)
  const semesterHours: Record<string, number> = {};
  for (const sem of semesters) {
    semesterHours[sem.id] = 0;
  }

  // 1. Topological sort the remaining courses
  const sortedCourses = prereqGraph.topologicalSort(remainingRequirements);

  // 2. Separate pinned and unpinned courses
  const pinnedCourseIds = new Set(Object.keys(pinnedCourses));
  const unpinnedSorted = sortedCourses.filter((c) => !pinnedCourseIds.has(c));

  // 3. Place pinned courses first
  for (const [courseId, semesterId] of Object.entries(pinnedCourses)) {
    if (!remainingRequirements.includes(courseId)) continue;
    const credits = prereqGraph.getCredits(courseId);
    plan[semesterId] = plan[semesterId] ?? [];
    plan[semesterId].push(courseId);
    semesterHours[semesterId] = (semesterHours[semesterId] ?? 0) + credits;
  }

  // 4. Greedy placement for unpinned courses
  const unplacedCourses: string[] = [];

  /**
   * Build the set of courses available strictly before `semesterIndex`.
   * Includes variant-expanded completed courses PLUS courses placed in earlier
   * semesters of the current plan.  This set is passed to the graph's CNF
   * evaluator so OR-group logic and equivalence resolution are handled there.
   */
  function buildBeforeSet(semesterIndex: number): Set<string> {
    const before = new Set<string>(completedSet);
    for (let i = 0; i < semesterIndex; i++) {
      for (const c of plan[semesters[i].id] ?? []) {
        before.add(c);
        // Also add variants so isRequirementSatisfied inside the graph can match
        for (const v of variants(c)) before.add(v);
      }
    }
    return before;
  }

  /**
   * Check if all CNF prereq groups are satisfied before a given semester index.
   * Delegates entirely to graph-engine's getUnsatisfiedPrereqGroups so the solver
   * and diagnostics share the same OR-group evaluation — they can never diverge.
   */
  function prereqsSatisfied(courseId: string, semesterIndex: number): boolean {
    const before = buildBeforeSet(semesterIndex);
    return prereqGraph.getUnsatisfiedPrereqGroups(courseId, before).length === 0;
  }

  /**
   * Check if all corequisites are satisfied in the same or earlier semester.
   */
  function coreqsSatisfied(courseId: string, semesterIndex: number): boolean {
    const coreqs = prereqGraph.getCoreqs(courseId);
    if (coreqs.length === 0) return true;

    for (const coreq of coreqs) {
      if (completedSet.has(coreq)) continue;

      const foundInPlan = isInSameOrPriorSemester(coreq, semesterIndex, semesters, plan, variants);
      if (!foundInPlan) return false;
    }
    return true;
  }

  for (const courseId of unpinnedSorted) {
    let placed = false;

    for (let i = 0; i < semesters.length; i++) {
      const sem = semesters[i];

      // Skip past and current semesters
      if (sem.status !== 'future') continue;

      // Check offering pattern
      if (!canOfferInSemester(courseId, sem, offeringSchedule)) continue;

      // Check credit hour limit
      const credits = prereqGraph.getCredits(courseId);
      if (semesterHours[sem.id] + credits > maxHoursPerSemester) continue;

      // Check prerequisites satisfied
      if (!prereqsSatisfied(courseId, i)) continue;

      // Check corequisites satisfied
      if (!coreqsSatisfied(courseId, i)) continue;

      // Place the course
      plan[sem.id].push(courseId);
      semesterHours[sem.id] += credits;
      placed = true;
      break;
    }

    if (!placed) {
      unplacedCourses.push(courseId);
    }
  }

  // 5. Validate the final plan (only future semesters, since past are transcript)
  const futurePlan: Plan = {};
  const futureOrder: string[] = [];
  for (const sem of semesters) {
    if (plan[sem.id].length > 0 || sem.status === 'future') {
      futurePlan[sem.id] = plan[sem.id];
      futureOrder.push(sem.id);
    }
  }

  // Full plan validation — include completed as "implicitly placed before"
  const violations = prereqGraph.validatePlan(plan, semesterOrder, completedSet).filter((v) => {
    // Only report violations for courses we placed (not transcript courses)
    const sem = semesters.find((s) => s.id === v.semesterId);
    return sem?.status === 'future';
  });

  // 6. Build totalHours output
  const totalHours: Record<string, number> = {};
  for (const sem of futureSemesters) {
    totalHours[sem.id] = semesterHours[sem.id];
  }

  return {
    plan,
    semesterOrder,
    violations,
    totalHours,
    unplacedCourses,
  };
}
