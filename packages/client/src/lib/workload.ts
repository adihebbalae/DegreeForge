/**
 * workload.ts — TASK-024
 *
 * Two exported utilities:
 *   1. computeSemesterDifficulty — composite difficulty score → heat-stripe bucket
 *   2. computeGraduationDelay   — re-runs auto-planner without courseId, returns
 *                                  how many extra semesters graduation is delayed
 *
 * Formula for computeSemesterDifficulty:
 *   raw = (mean_course_level_factor × 0.4) + (credit_load_factor × 0.35) + (avg_gpa_factor × 0.25)
 *
 *   mean_course_level_factor = avg(course_level / 10) where course_level = numeric part ÷ 100
 *     e.g. ECE 302 → 3.0, ECE 460 → 4.6, M 427 → 4.27
 *     normalized to [0,1] by clamping to level range [200,600]
 *
 *   credit_load_factor = totalCredits / 18 (18 = practical max load)
 *
 *   avg_gpa_factor = 1 - (semesterAvgGpa / 4.0)
 *     courses with no GPA data contribute 0.5 (neutral)
 *
 *   Buckets (on raw [0,1] scale):
 *     < 0.30  → green
 *     < 0.50  → yellow
 *     < 0.70  → orange
 *     >= 0.70 → red
 *
 * TODO (color-blind accessibility): after first pass, Adi will review palette and
 *   we will add WCAG-compliant patterns or secondary indicators (TASK-024 deferred).
 */

import { generateAutoPlan, type AutoPlannerInput } from './auto-planner';
import { getCourseCredits } from './course-utils';
import { parseCourseId } from './sanitize-course-list';
import type { Semester, CourseCatalog, GradeDistributions, Plan } from '../types';

// Course-level normalisation bounds: clamp a numeric course level to [MIN, MAX]
// before mapping to [0,1]. 200 = lower-division floor, 600 = graduate ceiling.
const COURSE_LEVEL_MIN = 200;
const COURSE_LEVEL_MAX = 600;

// ─── Types ────────────────────────────────────────────────────────────────────

export type HeatBucket = 'green' | 'yellow' | 'orange' | 'red';

/** Tailwind bg class for each workload heat bucket. Single source — used by SemesterTile and SemesterColumn. */
export const HEAT_STRIPE_CLASS: Record<HeatBucket, string> = {
  green:  'bg-green-400',
  yellow: 'bg-yellow-400',
  orange: 'bg-orange-400',
  red:    'bg-red-500',
};

export interface DifficultyResult {
  score: number;    // [0, 1] composite score
  bucket: HeatBucket;
}

// ─── LRU cache for computeGraduationDelay ────────────────────────────────────

const MEMO_CAP = 50;
const delayCache = new Map<string, number>();

function memoGet(key: string): number | undefined {
  return delayCache.get(key);
}

function memoSet(key: string, value: number): void {
  if (delayCache.size >= MEMO_CAP) {
    // Evict the oldest inserted entry (Map preserves insertion order)
    const firstKey = delayCache.keys().next().value;
    if (firstKey !== undefined) delayCache.delete(firstKey);
  }
  delayCache.set(key, value);
}

// ─── Helper: course numeric level ────────────────────────────────────────────

/**
 * Extract the numeric level of a course and normalise to [0,1].
 * "ECE 302" → 302; "M 427J" → 427; "CTI 301G" → 301.
 * Clamps to [200, 600] then normalises.
 */
function courseLevel(courseId: string): number {
  if (typeof courseId !== 'string' || !courseId) return 0;
  const parsed = parseCourseId(courseId);
  if (!parsed) return 0.5; // neutral for a non-numeric / unparseable course token
  const clamped = Math.max(COURSE_LEVEL_MIN, Math.min(COURSE_LEVEL_MAX, parsed.number));
  return (clamped - COURSE_LEVEL_MIN) / (COURSE_LEVEL_MAX - COURSE_LEVEL_MIN); // → [0, 1]
}

// ─── computeSemesterDifficulty ────────────────────────────────────────────────

/**
 * Returns a composite difficulty score and bucket for a given semester's course list.
 * Empty semesters always return { score: 0, bucket: 'green' }.
 */
export function computeSemesterDifficulty(
  semester: Semester,
  plan: Plan,
  gradeDistributions: GradeDistributions,
  catalog: CourseCatalog | null
): DifficultyResult {
  const courseIds = plan[semester.id] ?? [];

  if (courseIds.length === 0) {
    return { score: 0, bucket: 'green' };
  }

  // ── credit_load_factor ───────────────────────────────────────────────────
  const totalCredits = courseIds.reduce(
    (sum, id) => sum + getCourseCredits(id, catalog),
    0
  );
  const creditLoadFactor = Math.min(1, totalCredits / 18);

  // ── mean_course_level_factor ─────────────────────────────────────────────
  const levelSum = courseIds.reduce((sum, id) => sum + courseLevel(id), 0);
  const meanLevelFactor = levelSum / courseIds.length;

  // ── avg_gpa_factor ───────────────────────────────────────────────────────
  // Courses with missing GPA data contribute 0.5 (neutral difficulty)
  let gpaFactorSum = 0;
  for (const id of courseIds) {
    const dist = gradeDistributions[id];
    if (dist && dist.avg_gpa > 0) {
      gpaFactorSum += 1 - dist.avg_gpa / 4.0;
    } else {
      gpaFactorSum += 0.5;
    }
  }
  const avgGpaFactor = gpaFactorSum / courseIds.length;

  // ── Composite score ──────────────────────────────────────────────────────
  const score = meanLevelFactor * 0.4 + creditLoadFactor * 0.35 + avgGpaFactor * 0.25;
  const clamped = Math.max(0, Math.min(1, score));

  let bucket: HeatBucket;
  if (clamped < 0.30) {
    bucket = 'green';
  } else if (clamped < 0.50) {
    bucket = 'yellow';
  } else if (clamped < 0.70) {
    bucket = 'orange';
  } else {
    bucket = 'red';
  }

  return { score: clamped, bucket };
}

// ─── computeGraduationDelay ───────────────────────────────────────────────────

/**
 * Build a pinnedCourses map (courseId -> semesterId) from future-semester
 * entries in the full plan. This converts user-dragged future placements into
 * planner-visible pins so the solver respects them when re-running.
 *
 * Merges with any existing pinnedCourses already present in the input.
 */
function buildFuturePins(
  plannerInput: AutoPlannerInput
): Record<string, string> {
  const pins: Record<string, string> = { ...(plannerInput.pinnedCourses ?? {}) };
  for (const sem of plannerInput.semesters) {
    if (sem.status !== 'future') continue;
    for (const cId of plannerInput.currentPlan[sem.id] ?? []) {
      // Don't overwrite an already-existing pin for this course
      if (!(cId in pins)) {
        pins[cId] = sem.id;
      }
    }
  }
  return pins;
}

/**
 * Returns the number of additional semesters required to graduate if `courseId`
 * is removed from the plan (i.e. treated as never taken).
 *
 * Returns 0 if the course is not on the critical path (removing it doesn't
 * push graduation further out).
 *
 * Correctly handles courses placed in future semesters (by drag or prior planner
 * run) by converting future placements to pinnedCourses before re-running the
 * planner. Without this, the planner blanks future semesters and never sees the
 * course, so delay always collapses to 0 for future-placed cards.
 *
 * Memoised by `${courseId}:${planHash}:${pinsHash}` with LRU cap 50.
 */
export function computeGraduationDelay(
  courseId: string,
  plannerInput: AutoPlannerInput
): number {
  const planHash = JSON.stringify(plannerInput.currentPlan);
  const pinsHash = JSON.stringify(plannerInput.pinnedCourses ?? {});
  const key = `${courseId}:${planHash}:${pinsHash}`;

  const cached = memoGet(key);
  if (cached !== undefined) return cached;

  // ── Build future-semester pins so both runs respect user-placed future courses.
  // The auto-planner blanks future semesters (step 1) and only re-adds courses
  // via pinnedCourses (step 3), so entries in currentPlan[futureSem] are otherwise
  // invisible to the solver. We promote them to pins here.
  const futurePins = buildFuturePins(plannerInput);

  // ── Baseline: how many semesters does the plan use with all courses present?
  const baselineInput: AutoPlannerInput = {
    ...plannerInput,
    pinnedCourses: futurePins,
  };
  const baseline = generateAutoPlan(baselineInput);
  const baselineLastIdx = lastUsedSemesterIndex(baseline.plan, plannerInput.semesters);

  // ── Modified input: remove courseId from every semester + from future pins.
  const modifiedPlan: Plan = {};
  for (const [semId, courses] of Object.entries(plannerInput.currentPlan)) {
    modifiedPlan[semId] = courses.filter((c) => c !== courseId);
  }

  const modifiedPins: Record<string, string> = {};
  for (const [cId, semId] of Object.entries(futurePins)) {
    if (cId !== courseId) modifiedPins[cId] = semId;
  }

  const modified: AutoPlannerInput = {
    ...plannerInput,
    currentPlan: modifiedPlan,
    pinnedCourses: modifiedPins,
  };

  const withoutCourse = generateAutoPlan(modified);
  const modifiedLastIdx = lastUsedSemesterIndex(withoutCourse.plan, plannerInput.semesters);

  const delay = Math.max(0, modifiedLastIdx - baselineLastIdx);
  memoSet(key, delay);
  return delay;
}

/**
 * Returns the index of the last semester that has any courses placed,
 * or -1 if none.
 */
function lastUsedSemesterIndex(plan: Plan, semesters: Semester[]): number {
  let lastIdx = -1;
  for (let i = 0; i < semesters.length; i++) {
    const courses = plan[semesters[i].id] ?? [];
    if (courses.length > 0) lastIdx = i;
  }
  return lastIdx;
}

// ─── Exported for testing only ────────────────────────────────────────────────
export { delayCache as _delayCache };
