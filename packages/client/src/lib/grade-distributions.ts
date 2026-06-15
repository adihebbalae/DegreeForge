/**
 * Grade Distributions — Typed Loader
 *
 * Standalone module that reads grade-distributions.json and exposes a
 * simplified per-course stats shape suited for difficulty-signal features
 * (Stress Score, Roast My Schedule).
 *
 * Data source: UT Austin grade distribution data, extracted from UTGradesPlus
 * CSV exports (2021-2026) using the UT_Grade_Parser tool.
 *
 * Attribution:
 *   - doprz/UT_Grade_Parser — MIT License, Copyright (c) 2024 doprz
 *   - Longhorn-Developers/UT-Registration-Plus — MIT License,
 *     Copyright (c) 2023 Sriram Hariharan
 *
 * See LICENSES/ for full license texts.
 *
 * Integrated by TASK-059 (Stress Score): consumed directly by useStressScore.ts
 * and stress-score.ts. Not registered in DataContext — this module loads the
 * grade-distributions JSON independently via a static import.
 */

import rawData from '../../public/data/grade-distributions.json';
import type { GradeDistribution } from '../types';

/** Simplified per-course grade stats for difficulty-signal features */
export interface CourseGradeStats {
  /** Enrollment-weighted mean GPA (0–4.0 scale) */
  gpa_mean: number;
  /** Percentage of students receiving A+/A/A- */
  pct_a: number;
  /** Percentage of students receiving D+/D/D-/F (combined) */
  pct_df: number;
  /** Percentage of students with "Other" grade (withdrawals/incompletes) */
  withdrawal_rate: number;
  /** Total number of students across all sections */
  sample_size: number;
  /** Range of semesters covered, e.g. "Fall 2021–Spring 2025" */
  term_range: string;
}

type RawData = { courses: Record<string, GradeDistribution> };

const gradeData = rawData as RawData;

/** Module-level memo: computed once per courseId, cleared never (source JSON is immutable). */
const _statsCache = new Map<string, CourseGradeStats | undefined>();

/**
 * Returns grade stats for a given course ID (e.g. "ECE 411", "ECE 312").
 * Returns undefined if the course is not found in the dataset.
 * Results are memoized — repeated calls are O(1) after the first.
 */
export function getCourseGradeStats(courseId: string): CourseGradeStats | undefined {
  if (_statsCache.has(courseId)) return _statsCache.get(courseId);

  const course = gradeData.courses[courseId];
  if (!course) {
    _statsCache.set(courseId, undefined);
    return undefined;
  }

  const totalEnrollment = course.total_enrollment;
  if (totalEnrollment === 0) {
    _statsCache.set(courseId, undefined);
    return undefined;
  }

  // Compute withdrawal rate from "Other" grades across all sections
  const otherCount = course.sections.reduce(
    (sum, sec) => sum + (sec.grades['Other'] ?? 0),
    0
  );
  const withdrawalRate = Math.round((otherCount / totalEnrollment) * 1000) / 10;

  // pct_df = d_pct + f_pct (already computed in the JSON)
  const pctDf = Math.round((course.d_pct + course.f_pct) * 10) / 10;

  // Derive term range from section semesters
  const semesters = course.sections.map((s) => s.semester);
  const termRange = semesters.length > 0
    ? `${semesters[0]}–${semesters[semesters.length - 1]}`
    : 'Unknown';

  const stats: CourseGradeStats = {
    gpa_mean: course.avg_gpa,
    pct_a: course.a_pct,
    pct_df: pctDf,
    withdrawal_rate: withdrawalRate,
    sample_size: totalEnrollment,
    term_range: termRange,
  };
  _statsCache.set(courseId, stats);
  return stats;
}

/**
 * Returns stats for all courses in the dataset, keyed by course ID.
 * Useful for batch processing (e.g. scoring a full plan).
 */
export function getAllCourseGradeStats(): Record<string, CourseGradeStats> {
  const result: Record<string, CourseGradeStats> = {};
  for (const courseId of Object.keys(gradeData.courses)) {
    const stats = getCourseGradeStats(courseId);
    if (stats !== undefined) {
      result[courseId] = stats;
    }
  }
  return result;
}

/** Total number of courses in the loaded dataset */
export function getDatasetCourseCount(): number {
  return Object.keys(gradeData.courses).length;
}
