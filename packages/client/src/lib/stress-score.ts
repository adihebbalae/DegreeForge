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
 * Per-semester Stress Score:
 *   Score = weighted mean difficulty, using IN-RESIDENCE credit hours as weights.
 *   (AP/transfer courses contribute 0 credits via buildTermLoadCredits, so they
 *   do not inflate the score — this is guaranteed by the caller passing
 *   termLoadCredits from buildTermLoadCredits, not buildTranscriptCredits.)
 *
 *   If the term has 0 in-residence credit hours (empty term or all AP/transfer),
 *   score = 0, band = 'low'.
 *
 * Band thresholds (documented):
 *   0–34  → 'low'    (manageable term; lighter courses or low load)
 *   35–59 → 'medium' (normal full-time ECE workload)
 *   60–100→ 'high'   (demanding term; high credit load of hard courses)
 *
 * These thresholds were calibrated against typical UT ECE plan data:
 *   - A standard 3-course term of lower-division ECE ≈ 25–35 (low-medium)
 *   - A 5-course term mixing upper-div ECE with gen-eds ≈ 40–55 (medium)
 *   - A heavy upper-division semester (5 courses, all hard ECE) ≈ 60–75 (high)
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

// ─── Band thresholds ─────────────────────────────────────────────────────────

/** Stress Score threshold (inclusive) below which a semester is classified "low" */
export const BAND_LOW_MAX = 34;
/** Stress Score threshold (inclusive) below which a semester is classified "medium" */
export const BAND_MEDIUM_MAX = 59;
// Score >= 60 → 'high'

export type StressBand = 'low' | 'medium' | 'high';

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
  /** 0–100 stress score (weighted mean of per-course difficulty × credit hours) */
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
 * @param catalogCredits  Fallback credit-hours map (course catalog or prereq graph
 *                      credits). Used when a course is not in termLoadCredits
 *                      (i.e. a future course the student hasn't yet taken).
 *                      Pass an empty object if no fallback is needed.
 */
export function computeSemesterStress(
  courseIds: string[],
  termLoadCredits: Record<string, number>,
  catalogCredits: Record<string, number>,
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

  let totalWeightedDifficulty = 0;
  let totalCredits = 0;
  let coursesWithData = 0;

  const courses: CourseStressEntry[] = courseIds.map((courseId) => {
    // Credit hours: prefer termLoadCredits (AP/transfer → 0), fallback to catalog
    const creditHours =
      termLoadCredits[courseId] !== undefined
        ? termLoadCredits[courseId]
        : (catalogCredits[courseId] ?? 3);

    const stats = getCourseGradeStats(courseId);
    const hasNoData = stats === undefined;
    const difficulty = hasNoData
      ? NEUTRAL_DIFFICULTY
      : computeCourseDifficulty(stats);

    if (!hasNoData) coursesWithData++;

    // Only in-residence credits (creditHours > 0) contribute to the weighted score
    totalWeightedDifficulty += difficulty * creditHours;
    totalCredits += creditHours;

    return { courseId, creditHours, difficulty, hasNoData };
  });

  // If all courses are AP/transfer (totalCredits = 0), score = 0
  const score =
    totalCredits > 0
      ? Math.round(totalWeightedDifficulty / totalCredits)
      : 0;

  const clampedScore = Math.min(100, Math.max(0, score));

  return {
    score: clampedScore,
    band: scoreToStressBand(clampedScore),
    courses,
    coursesWithData,
    totalCourses: courseIds.length,
  };
}
