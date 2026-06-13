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
  CourseCatalog,
} from '../types';
import { PrereqGraph } from './graph-engine';
import { getCourseCredits, getOfferedSeasons } from './course-utils';
import { expandVariants, isInSameOrPriorSemester, addWithVariants } from './variants';
import { getCourseGradeStats } from './grade-distributions';
import { computeCourseDifficulty, NEUTRAL_DIFFICULTY } from './stress-score';

/**
 * Planner optimization objective.
 *   'fastest' — original behavior: place each course in the EARLIEST valid term
 *               (minimize time-to-graduation).
 *   'easiest' — among valid terms, place each course to minimize aggregate
 *               difficulty / balance hard courses across terms using the real
 *               grade-distribution Stress Score. May defer graduation in exchange
 *               for a lower-stress / higher-expected-GPA arrangement.
 */
export type OptimizeMode = 'fastest' | 'easiest';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SolverInput {
  /** Courses already completed or in-progress (treated as done) */
  completedCourses: string[];
  /** Flat list of all remaining required course IDs */
  remainingRequirements: string[];
  /** PrereqGraph instance from TASK-003 */
  prereqGraph: PrereqGraph;
  /** Course catalog — canonical credit source (via getCourseCredits) */
  catalog: CourseCatalog;
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
  /**
   * Optimization objective (default 'fastest'). 'easiest' arranges valid plans
   * to minimize aggregate Stress Score and balance difficulty across terms.
   */
  optimize?: OptimizeMode;
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
 *
 * offering-schedule.json is the ONLY offering source (E2 — the former
 * prerequisite-graph fallback rows were migrated in as provenance:"baseline";
 * the graph no longer carries an `offered` copy). Reads go through the
 * canonical getOfferedSeasons accessor.
 *
 * Rules:
 * - Resolved season list → membership check.
 * - Nothing known (null) → assume available for all seasons (open world).
 * - Summer requires "summer" to appear explicitly in the resolved list (opt-in only).
 *
 * Exported so auto-planner and diagnostics use the same offering predicate.
 */
export function canOfferInSemester(
  courseId: string,
  semester: Semester,
  offeringSchedule: OfferingSchedule
): boolean {
  const seasons = getOfferedSeasons(courseId, offeringSchedule);
  if (seasons === null) return true;
  return seasons.includes(semester.season.toLowerCase());
}

/**
 * Offering predicate with past-term relaxation (TASK-068).
 *
 * Offering constraints apply ONLY to FUTURE planned placements. A course sitting
 * in a past or current(-completed) term was, by definition, offered then — the
 * student already took it — so it is accepted regardless of offering-schedule.json.
 *
 * Use this (not the bare canOfferInSemester) anywhere a placement is validated
 * against the offering schedule, so past/profile entries never raise an offering
 * warning/violation. Future placements still respect the real offering schedule.
 */
export function isOfferingAllowed(
  courseId: string,
  semester: Semester,
  offeringSchedule: OfferingSchedule
): boolean {
  if (semester.status !== 'future') return true;
  return canOfferInSemester(courseId, semester, offeringSchedule);
}

/**
 * Per-course difficulty (0–100) from the real grade-distribution Stress Score.
 * Missing-data courses get NEUTRAL_DIFFICULTY. Used by the 'easiest' objective.
 */
function courseDifficulty(courseId: string): number {
  const stats = getCourseGradeStats(courseId);
  return stats === undefined ? NEUTRAL_DIFFICULTY : computeCourseDifficulty(stats);
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
export function generatePlan(input: SolverInput, horizonIndex?: number): SolverOutput {
  const {
    completedCourses,
    remainingRequirements,
    prereqGraph,
    catalog,
    offeringSchedule,
    pinnedCourses,
    maxHoursPerSemester,
    semesters,
    existingPlan,
    degreeReqs,
    optimize = 'fastest',
  } = input;

  // 'easiest' is a two-phase strategy. First run 'fastest' to confirm every
  // course is placeable and to discover the term horizon. Then balance difficulty
  // across terms to minimize the WORST (peak) term's stress.
  //
  // Phase 2 is allowed to defer graduation past fastest's horizon (the honest
  // GPA-not-speed tradeoff) but is capped at fastest's term count + DEFER_SLACK
  // extra terms. The cap keeps the spread bounded so a topo-late course always
  // has room — easiest never DROPS a course that fastest placed.
  if (optimize === 'easiest' && horizonIndex === undefined) {
    const fastest = generatePlan({ ...input, optimize: 'fastest' });
    let lastUsed = -1;
    let usedTermCount = 0;
    for (let i = 0; i < semesters.length; i++) {
      const sem = semesters[i];
      if (sem.status === 'future' && (fastest.plan[sem.id] ?? []).length > 0) {
        lastUsed = i;
        usedTermCount++;
      }
    }
    // If fastest used no future terms (nothing to place), just return it.
    if (lastUsed < 0) return fastest;

    // Allow easiest to use a few extra future terms beyond fastest's last term,
    // so it can spread hard courses out (lower peak) without running off the end.
    const DEFER_SLACK = 3;
    const futureIdx = semesters
      .map((s, i) => ({ s, i }))
      .filter((x) => x.s.status === 'future')
      .map((x) => x.i);
    const lastUsedPos = futureIdx.indexOf(lastUsed);
    const horizonPos = Math.min(futureIdx.length - 1, lastUsedPos + DEFER_SLACK);
    return generatePlan(input, futureIdx[horizonPos]);
  }

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
  // Track accumulated credit-weighted difficulty per semester (for 'easiest'
  // load-balancing — placing into the lowest-weighted-difficulty valid term
  // spreads hard courses instead of front-loading them).
  const semesterWeightedDifficulty: Record<string, number> = {};
  for (const sem of semesters) {
    semesterHours[sem.id] = 0;
    semesterWeightedDifficulty[sem.id] = 0;
  }

  // Seed both trackers from any pre-existing future placements (so balancing and
  // caps account for courses already sitting in future terms before this run).
  for (const sem of semesters) {
    if (sem.status !== 'future') continue;
    for (const c of plan[sem.id] ?? []) {
      const cr = getCourseCredits(c, catalog);
      semesterHours[sem.id] += cr;
      semesterWeightedDifficulty[sem.id] += courseDifficulty(c) * cr;
    }
  }

  // 1. Topological sort the remaining courses
  const sortedCourses = prereqGraph.topologicalSort(remainingRequirements);

  // 2. Separate pinned and unpinned courses
  const pinnedCourseIds = new Set(Object.keys(pinnedCourses));
  const unpinnedSorted = sortedCourses.filter((c) => !pinnedCourseIds.has(c));

  // 3. Place pinned courses first
  for (const [courseId, semesterId] of Object.entries(pinnedCourses)) {
    if (!remainingRequirements.includes(courseId)) continue;
    const credits = getCourseCredits(courseId, catalog);
    plan[semesterId] = plan[semesterId] ?? [];
    plan[semesterId].push(courseId);
    semesterHours[semesterId] = (semesterHours[semesterId] ?? 0) + credits;
    semesterWeightedDifficulty[semesterId] =
      (semesterWeightedDifficulty[semesterId] ?? 0) + courseDifficulty(courseId) * credits;
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
    const credits = getCourseCredits(courseId, catalog);

    // Collect every VALID future semester this course can go in. Validity is
    // identical in both modes (prereqs + coreqs + caps + future offerings) — the
    // mode only changes WHICH valid term we pick, never whether a placement is
    // legal. This keeps 'easiest' plans provably as valid as 'fastest' plans.
    const validIndices: number[] = [];
    // In 'easiest' mode, restrict to the fastest-derived horizon so balancing
    // never pushes a course past fastest's graduation term.
    const upperBound = optimize === 'easiest' && horizonIndex !== undefined
      ? horizonIndex
      : semesters.length - 1;
    for (let i = 0; i <= upperBound; i++) {
      const sem = semesters[i];
      if (sem.status !== 'future') continue;
      if (!canOfferInSemester(courseId, sem, offeringSchedule)) continue;
      if (semesterHours[sem.id] + credits > maxHoursPerSemester) continue;
      if (!prereqsSatisfied(courseId, i)) continue;
      if (!coreqsSatisfied(courseId, i)) continue;
      validIndices.push(i);
    }

    // Safety net: if balancing-within-horizon found no slot (e.g. caps tightened
    // by redistribution), fall back to the full horizon so easiest never DROPS a
    // course that fastest could place.
    if (validIndices.length === 0 && optimize === 'easiest' && horizonIndex !== undefined) {
      for (let i = 0; i < semesters.length; i++) {
        const sem = semesters[i];
        if (sem.status !== 'future') continue;
        if (!canOfferInSemester(courseId, sem, offeringSchedule)) continue;
        if (semesterHours[sem.id] + credits > maxHoursPerSemester) continue;
        if (!prereqsSatisfied(courseId, i)) continue;
        if (!coreqsSatisfied(courseId, i)) continue;
        validIndices.push(i);
      }
    }

    if (validIndices.length === 0) {
      unplacedCourses.push(courseId);
      continue;
    }

    let chosen: number;
    if (optimize === 'easiest') {
      // Choose the valid term that minimizes that term's resulting stress
      // (credit-weighted mean difficulty) — this spreads hard courses so the
      // WORST term is as mild as possible. Ties broken by earliest term so the
      // result stays deterministic and never needlessly defers graduation.
      const diff = courseDifficulty(courseId) * credits;
      const termStressAfter = (idx: number): number => {
        const id = semesters[idx].id;
        const hours = semesterHours[id] + credits;
        return hours > 0 ? (semesterWeightedDifficulty[id] + diff) / hours : 0;
      };
      chosen = validIndices[0];
      let best = termStressAfter(chosen);
      for (let k = 1; k < validIndices.length; k++) {
        const idx = validIndices[k];
        const s = termStressAfter(idx);
        if (s < best) {
          best = s;
          chosen = idx;
        }
      }
    } else {
      // 'fastest' — earliest valid term (original behavior).
      chosen = validIndices[0];
    }

    const sem = semesters[chosen];
    plan[sem.id].push(courseId);
    semesterHours[sem.id] += credits;
    semesterWeightedDifficulty[sem.id] += courseDifficulty(courseId) * credits;
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
