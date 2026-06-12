/**
 * auto-planner.ts
 *
 * Deterministic 4-year degree plan generator (TASK-018, was deferred TASK-004).
 *
 * Pure TypeScript — no React, no I/O, no side effects. Safe for tests and SSR.
 *
 * Strategy:
 *   1. Build the "satisfied set" from completed courses + in-progress + past/current plan,
 *      expanding each course to its variants (honors, legacy catalog number, transfer equivs)
 *      so prereq checks work regardless of which form the user has.
 *   2. Compute the remaining required courses for ECE core, math/physics sequence,
 *      tech-core, gen-ed slots (with concrete options), and optional Math BA additions.
 *   3. Topo-sort the required set respecting the prereq graph.
 *   4. Greedily fill future semesters earliest-first, honoring per-semester credit-hour cap
 *      (17 or 18 from profile load tolerance), offering pattern from offering-schedule.json,
 *      prereqs (in earlier semester), coreqs (same-or-earlier semester), and any pinned
 *      placements treated as fixed.
 *
 * The solver is intentionally conservative — courses without concrete option lists
 * (VAPA/SBS "list_of_approved", free electives, advanced tech elective) are left for
 * the user to fill in manually and surfaced in `warnings`.
 *
 * Behavior decisions (unified with solver.ts):
 *   A) Offering source: offering-schedule.json only (single canonical source, E2;
 *      via canOfferInSemester → getOfferedSeasons).
 *   B) Load cap: credit-hours (17/18 per profile tolerance), not course count.
 */

import { PrereqGraph } from './graph-engine';
import { generatePlan } from './solver';
import { addWithVariants } from './variants';
import { computeRemainingRequired } from './requirements';
import type {
  UserProfile,
  DegreeRequirements,
  TechCoreTrack,
  MathRequirements,
  Plan,
  Semester,
  CourseCatalog,
  PrereqNode,
  OfferingSchedule,
} from '../types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AutoPlannerInput {
  prereqGraph: PrereqGraph;
  /** Offering schedule from offering-schedule.json. Used for offering pattern checks. */
  offeringSchedule?: OfferingSchedule;
  userProfile: UserProfile;
  degreeReqs: DegreeRequirements;
  techCore: TechCoreTrack;
  mathReqs: MathRequirements;
  mathBAToggle: boolean;
  semesters: Semester[];
  currentPlan: Plan;
  /** courseId -> semesterId. Pinned courses are placed first and not moved. */
  pinnedCourses?: Record<string, string>;
  /** Course catalog — canonical credit source (via getCourseCredits) */
  catalog: CourseCatalog;
  /**
   * Override the profile-derived credit-hour cap per semester.
   * When set, used instead of the value derived from load-tolerance.
   * (Renamed from maxCoursesPerSemester — the old name was misleading because
   * the cap is in credit hours, not a course count.)
   */
  maxHoursPerSemesterOverride?: number;
}

export interface AutoPlannerResult {
  plan: Plan;
  /** Required courses the solver couldn't fit anywhere. */
  unplacedCourses: string[];
  /** Single-line reason when unplacedCourses is non-empty. */
  reason?: string;
  /** Non-fatal notes the UI can surface (e.g. "free electives left for manual selection"). */
  warnings: string[];
}

// ─── Required-course derivation ───────────────────────────────────────────────

/**
 * Build the flat list of courses the user still needs to take.
 * Excludes anything already in the satisfied set.
 *
 * Delegates to computeRemainingRequired (requirements.ts) — the single canonical
 * implementation shared by useDiagnostics, useGhostPlan, run-solver, and this
 * auto-planner. Preserved here so existing callers keep working unchanged.
 */
export function computeRequiredCourses(
  degreeReqs: DegreeRequirements,
  techCore: TechCoreTrack,
  mathReqs: MathRequirements,
  mathBAToggle: boolean,
  satisfied: Set<string>
): { required: string[]; warnings: string[] } {
  return computeRemainingRequired(degreeReqs, techCore, mathReqs, mathBAToggle, satisfied);
}

// ─── Load-cap derivation ──────────────────────────────────────────────────────

/**
 * Canonical credit-hour cap derived from the user profile's load tolerance.
 *
 * Canonical LoadTolerance values (SettingsContext):
 *   light → 15, normal → 17, above_average → 18, heavy → 19
 *
 * Legacy fixture strings are preserved via tolerant fallbacks so existing
 * tests and stored profiles continue to work:
 *   up_to_18 / above_average → 18
 *   up_to_15 / below_average / light → 15
 *   heavy → 19
 *   moderate / normal / unrecognised → 17
 *
 * Exported so run-solver.ts and useGhostPlan.ts call the same function.
 */
export function getCreditHourCap(profile: UserProfile | null, overrideHours?: number): number {
  if (typeof overrideHours === 'number' && overrideHours > 0) return overrideHours;
  const tol = profile?.preferences?.course_load_tolerance;
  if (tol === 'heavy') return 19;
  if (tol === 'above_average' || tol === 'up_to_18') return 18;
  if (tol === 'light' || tol === 'below_average' || tol === 'up_to_15') return 15;
  // 'normal', 'moderate', undefined, or any unrecognised value
  return 17;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function generateAutoPlan(input: AutoPlannerInput): AutoPlannerResult {
  const {
    prereqGraph,
    catalog,
    offeringSchedule = {},
    userProfile,
    degreeReqs,
    techCore,
    mathReqs,
    mathBAToggle,
    semesters,
    currentPlan,
    pinnedCourses = {},
    maxHoursPerSemesterOverride,
  } = input;

  // ── 1. Build the variant-expanded satisfied set (completed + in-progress +
  //       past/current plan) for use by computeRequiredCourses.
  //       generatePlan will rebuild its own set internally from completedCourses.
  const satisfied = new Set<string>();
  for (const c of userProfile.completed_courses) addWithVariants(satisfied, c.course, degreeReqs);
  for (const c of userProfile.in_progress_courses) addWithVariants(satisfied, c.course, degreeReqs);
  for (const sem of semesters) {
    if (sem.status === 'past' || sem.status === 'current') {
      for (const c of currentPlan[sem.id] ?? []) addWithVariants(satisfied, c, degreeReqs);
    }
  }

  // ── 2. Compute remaining required courses (uses satisfied for filtering) ──
  const { required, warnings } = computeRequiredCourses(
    degreeReqs,
    techCore,
    mathReqs,
    mathBAToggle,
    satisfied
  );

  // ── 3. Derive credit-hour cap ─────────────────────────────────────────────
  const creditHourCap = getCreditHourCap(userProfile, maxHoursPerSemesterOverride);

  // ── 4. Flatten completedCourses list for generatePlan ────────────────────
  // generatePlan will variant-expand these itself when degreeReqs is provided.
  const completedCourses = [
    ...userProfile.completed_courses.map((c) => c.course),
    ...userProfile.in_progress_courses.map((c) => c.course),
  ];

  // ── 5. Delegate ALL greedy placement to the single engine: generatePlan ───
  // Passing degreeReqs enables variant-aware prereq/coreq checking in the engine.
  const solverResult = generatePlan({
    completedCourses,
    remainingRequirements: required,
    prereqGraph,
    catalog,
    offeringSchedule,
    pinnedCourses,
    maxHoursPerSemester: creditHourCap,
    semesters,
    existingPlan: currentPlan,
    degreeReqs,
  });

  // ── 6. Map SolverOutput → AutoPlannerResult ───────────────────────────────
  const futureSemesters = semesters.filter((s) => s.status === 'future');
  const unplaced = solverResult.unplacedCourses;
  const reason =
    unplaced.length > 0
      ? `Could not fit ${unplaced.length} course${unplaced.length === 1 ? '' : 's'} ` +
        `within the remaining ${futureSemesters.length} semesters at ${creditHourCap} credit hours/semester. ` +
        `Try increasing load tolerance or extending graduation timeline.`
      : undefined;

  return { plan: solverResult.plan, unplacedCourses: unplaced, reason, warnings };
}
