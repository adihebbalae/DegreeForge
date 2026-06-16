/**
 * stress-score.ts — TASK-059 Stress Score (per-semester workload/difficulty signal)
 *
 * Two exported utilities:
 *   1. computeCourseDifficulty — per-course 0–100 difficulty from grade stats
 *   2. computeSemesterStress   — per-semester Stress Score + Low/Med/High band
 *
 * ─── Formula ─────────────────────────────────────────────────────────────────
 *
 * Per-course difficulty (0–100):
 *   Three components, each derived from CourseGradeStats:
 *
 *   gpa_score      = 1 - (gpa_mean / GPA_MAX)
 *                    Inverted GPA: lower mean GPA → higher difficulty.
 *                    This is the PRIMARY signal (highest weight).
 *
 *   df_score       = pct_df / 100
 *                    Fraction of students who received D+/D/D-/F.
 *                    Amplifies the GPA signal: courses where many students fail
 *                    are harder than GPA alone implies (grade compression at the
 *                    bottom matters).
 *
 *   wr_score       = withdrawal_rate / 100
 *                    Fraction of students who withdrew or received "Other" grade.
 *                    Courses with high withdrawal rates signal a difficulty cliff
 *                    (students who can't pass often withdraw to preserve GPA).
 *
 *   raw = W_GPA * gpa_score + W_DF * df_score + W_WR * wr_score
 *
 *   difficulty = clamp(raw / NORMALIZATION_MAX, 0, 1) * 100
 *
 *   NORMALIZATION_MAX (0.40) is calibrated so that the most challenging ECE
 *   required courses land around 50–65/100, leaving headroom for outlier hard
 *   courses to reach 80–100 without compression.
 *
 *   Sanity anchor: difficulty('ECE 312') > difficulty('ECE 411')
 *   (2.841 vs 3.042 gpa; ECE 312 also has higher pct_df + withdrawal_rate)
 *
 * Missing-data neutral default (NEUTRAL_DIFFICULTY = 50):
 *   A course with no grade-distribution entry is assigned difficulty 50/100.
 *   Rationale: using 0 ("easy") would under-count hard courses with sparse data
 *   (new courses, small enrollment, cross-listed sections). 50 = middle of the
 *   scale, honest about uncertainty. The UI exposes coverage (X/Y courses) so
 *   the student can see how reliable the score is.
 *
 * Per-semester Stress Score (normalized, credit-weighted sum):
 *   rawLoad = Σ over in-residence courses (difficulty_i × creditHours_i)
 *   score   = min(100, round(STRESS_ANCHOR × rawLoad / STRESS_REF_LOAD))
 *
 *   Rationale: credit-weighted sum scales monotonically with load — adding any
 *   course or substituting a harder one never decreases the score. It also
 *   differentiates full-load semesters (5-hard > 5-moderate > 2-course) without
 *   saturating. The previous saturating union over-saturated in practice: all
 *   semesters read "High" (77–99) even for moderate plans.
 *
 *   Constants are calibrated so a normal full-time moderate load
 *   (STRESS_REF_LOAD ≈ 15 cr × difficulty 50 = 750) maps to roughly STRESS_ANCHOR
 *   (≈ 55), landing in the Medium band with headroom for harder loads to reach High.
 *
 *   Examples (3 cr per course unless noted):
 *     1 course d=50          →  rawLoad=150  → score=11  (Low)
 *     2 courses d=50+30      →  rawLoad=240  → score=18  (Low)
 *     5 courses d=50 each    →  rawLoad=750  → score=55  (Med)
 *     5 courses d=70 each    →  rawLoad=1050 → score=77  (High)
 *     5 courses d=30 each    →  rawLoad=450  → score=33  (Low)
 *
 *   AP/transfer courses contribute 0 credits via buildTermLoadCredits, so they
 *   are excluded from the sum — this is guaranteed by the caller passing
 *   termLoadCredits from buildTermLoadCredits, not buildTranscriptCredits.
 *
 *   If the term has 0 in-residence courses (empty term or all AP/transfer),
 *   score = 0, band = 'low'.
 *
 * Band thresholds (calibrated for the normalized-sum scale):
 *   0–34  → 'low'    (light load: 1–3 courses or mostly easy courses)
 *   35–64 → 'medium' (normal full-time ECE workload)
 *   65–100→ 'high'   (demanding term: high credit load of hard courses)
 *
 * These thresholds were calibrated so realistic plans span all three bands:
 *   - A 1-course or 2-course semester ≈ 10–20 (low)
 *   - A 5-course moderate semester (d≈50 each) ≈ 55 (medium)
 *   - A 5-course heavy ECE semester (d≈70 each) ≈ 77 (high)
 */

import { getCourseGradeStats } from './grade-distributions';
import type { CourseGradeStats } from './grade-distributions';

// ─── Weight constants (tunable — see formula comment above) ──────────────────

/** Weight for GPA-based component (primary signal: lower GPA = harder) */
export const W_GPA = 0.65;
/** Weight for D+/F rate component (fail amplifier) */
export const W_DF = 0.20;
/** Weight for withdrawal rate component (drop amplifier) */
export const W_WR = 0.15;

/** Maximum GPA on a 4.0 scale */
const GPA_MAX = 4.0;

/**
 * Calibration constant: the raw formula value that maps to difficulty 100.
 * Chosen so a very challenging ECE course (e.g. ECE 312, gpa=2.841, pct_df=8.8%,
 * wr=10.6%) lands around 55/100 and true outliers can reach 80–100.
 */
export const NORMALIZATION_MAX = 0.40;

/**
 * Difficulty value assigned to a course with no grade-distribution entry.
 * 50/100 = middle of the scale — honest about uncertainty.
 * NOT 0 (which would silently classify missing-data courses as "easy").
 */
export const NEUTRAL_DIFFICULTY = 50;

// ─── Normalized-sum aggregation constants ────────────────────────────────────

/**
 * Reference load (in difficulty × credit-hours units) that a normal full-time
 * moderate semester represents.  Calibrated as 15 credit-hours × difficulty 50
 * = 750.  A semester at exactly this load scores STRESS_ANCHOR.
 */
export const STRESS_REF_LOAD = 750;

/**
 * Anchor score (0–100) that a semester at STRESS_REF_LOAD receives.
 * Set to 55 so a normal moderate full load lands comfortably in Medium, with
 * headroom for harder loads to climb into High.
 */
export const STRESS_ANCHOR = 55;

// ─── Band thresholds ─────────────────────────────────────────────────────────

/** Stress Score threshold (inclusive) below which a semester is classified "low" */
export const BAND_LOW_MAX = 34;
/** Stress Score threshold (inclusive) below which a semester is classified "medium" */
export const BAND_MEDIUM_MAX = 64;
// Score >= 65 → 'high'

export type StressBand = 'low' | 'medium' | 'high';

/** Human-readable short label for each stress band. Single source — used by SemesterTile, MobileSemesterCard, and FocusInsightsPanel. */
export const STRESS_BAND_LABEL: Record<StressBand, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
};

// ─── Types ────────────────────────────────────────────────────────────────────

/** Per-course entry in the hover breakdown */
export interface CourseStressEntry {
  courseId: string;
  /** Credit hours used in the score (0 for AP/transfer courses) */
  creditHours: number;
  /** 0–100 difficulty score. NEUTRAL_DIFFICULTY if no grade data. */
  difficulty: number;
  /** True when this course has no grade-distribution data */
  hasNoData: boolean;
}

/** Result of computeSemesterStress */
export interface SemesterStressResult {
  /** 0–100 stress score (normalized credit-weighted sum of per-course difficulty) */
  score: number;
  /** Categorical band derived from score and BAND thresholds */
  band: StressBand;
  /** Per-course breakdown for hover tooltip */
  courses: CourseStressEntry[];
  /** Number of courses that HAD grade data (for coverage display) */
  coursesWithData: number;
  /** Total courses in this term (for coverage display "X/Y courses with data") */
  totalCourses: number;
}

// ─── Per-course difficulty ────────────────────────────────────────────────────

/**
 * Compute a 0–100 difficulty score for one course from its grade stats.
 *
 * Uses the GPA-primary + fail/drop amplifier formula (see file header).
 * Lower gpa_mean → higher difficulty; high pct_df + withdrawal_rate amplify it.
 */
export function computeCourseDifficulty(stats: CourseGradeStats): number {
  const gpaScore = 1 - stats.gpa_mean / GPA_MAX;
  const dfScore = stats.pct_df / 100;
  const wrScore = stats.withdrawal_rate / 100;

  const raw = W_GPA * gpaScore + W_DF * dfScore + W_WR * wrScore;
  const normalized = Math.min(1, Math.max(0, raw / NORMALIZATION_MAX));
  return Math.round(normalized * 100);
}

// ─── Band helper ─────────────────────────────────────────────────────────────

/** Map a 0–100 stress score to a Low/Medium/High band */
export function scoreToStressBand(score: number): StressBand {
  if (score <= BAND_LOW_MAX) return 'low';
  if (score <= BAND_MEDIUM_MAX) return 'medium';
  return 'high';
}

// ─── Per-semester stress ──────────────────────────────────────────────────────

/**
 * Compute the Stress Score for a single semester.
 *
 * @param courseIds     Ordered list of course IDs in this semester.
 * @param termLoadCredits  course-id → credit_hours mapping from buildTermLoadCredits.
 *                      AP/transfer courses will have 0 credits here, so they do
 *                      NOT inflate the stress score.
 * @param resolveCredits  Canonical credit resolver for courses not in
 *                      termLoadCredits (i.e. future courses the student hasn't
 *                      yet taken). Callers pass
 *                      `(id) => getCourseCredits(id, catalog)`.
 */
export function computeSemesterStress(
  courseIds: string[],
  termLoadCredits: Record<string, number>,
  resolveCredits: (courseId: string) => number,
): SemesterStressResult {
  if (courseIds.length === 0) {
    return {
      score: 0,
      band: 'low',
      courses: [],
      coursesWithData: 0,
      totalCourses: 0,
    };
  }

  let rawLoad = 0; // Σ (difficulty_i × creditHours_i) for in-residence courses
  let hasInResidenceCourse = false;
  let coursesWithData = 0;

  const courses: CourseStressEntry[] = courseIds.map((courseId) => {
    // Render-boundary guard: treat invalid ids as zero-credit no-data courses.
    if (typeof courseId !== 'string' || !courseId) {
      return { courseId: courseId ?? '', creditHours: 0, difficulty: NEUTRAL_DIFFICULTY, hasNoData: true };
    }

    // Credit hours: prefer termLoadCredits (AP/transfer → 0), fallback to the
    // canonical resolver
    const creditHours =
      termLoadCredits[courseId] !== undefined
        ? termLoadCredits[courseId]
        : resolveCredits(courseId);

    const stats = getCourseGradeStats(courseId);
    const hasNoData = stats === undefined;
    const difficulty = hasNoData
      ? NEUTRAL_DIFFICULTY
      : computeCourseDifficulty(stats);

    if (!hasNoData) coursesWithData++;

    // Only in-residence courses (creditHours > 0) enter the weighted sum
    if (creditHours > 0) {
      rawLoad += difficulty * creditHours;
      hasInResidenceCourse = true;
    }

    return { courseId, creditHours, difficulty, hasNoData };
  });

  // Normalized credit-weighted sum: min(100, round(ANCHOR × rawLoad / REF_LOAD))
  // Empty or all-AP/transfer → 0
  const score = hasInResidenceCourse
    ? Math.min(100, Math.round((STRESS_ANCHOR * rawLoad) / STRESS_REF_LOAD))
    : 0;

  return {
    score,
    band: scoreToStressBand(score),
    courses,
    coursesWithData,
    totalCourses: courseIds.length,
  };
}
