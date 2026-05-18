/**
 * Grade Distribution Parser — Per-Instructor Join Logic
 *
 * Pure functions for building `byInstructor` grade statistics from:
 *  1. UTGradesPlus CSV exports (section-level grade counts)
 *  2. fall-2026-sections.json (instructor names per section unique number)
 *
 * CSV column format confirmed by inspection of all 5 files (2021-2026):
 *   Semester | Section Number | Course Prefix | Course Number | Course Title |
 *   Course | Letter Grade | Count of letter grade | Department/Program
 *
 * ⚠️  KNOWN LIMITATION: The UTGradesPlus CSVs do NOT include an instructor
 * column. The reparse script aborts the CSV-based instructor join and falls
 * back to fall-2026-sections.json for instructor attribution.
 *
 * Instructor name format: "First [Middle] Last" — verbatim from
 * fall-2026-sections.json (e.g. "Nina K Telang", "Shyam Shankar").
 * Sections with no instructor listed are bucketed under "Unknown".
 */

import type { GradeDistribution, InstructorGradeStats } from '../types';

/** Standard grade letter order */
export const GRADE_LETTERS = [
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'F', 'Other',
] as const;

/** GPA quality points per letter grade (UT Austin standard) */
export const GPA_POINTS: Record<string, number> = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.67,
  'B+': 3.33, 'B': 3.0, 'B-': 2.67,
  'C+': 2.33, 'C': 2.0, 'C-': 1.67,
  'D+': 1.33, 'D': 1.0, 'D-': 0.67,
  'F': 0.0,
  'Other': 0.0, // withdrawn/incomplete — excluded from GPA calc
};

/**
 * Returns true if the given CSV header row contains an instructor column.
 *
 * Expected column names (case-insensitive, trimmed):
 *   "instructor", "professor", "professor name", "instructor name"
 *
 * The UTGradesPlus 2021-2026 exports do NOT contain any of these columns.
 * This function is used to detect that gap early and emit a clear error.
 */
export function hasInstructorColumn(headers: string[]): boolean {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  return normalized.some(
    (h) =>
      h === 'instructor' ||
      h === 'professor' ||
      h === 'professor name' ||
      h === 'instructor name'
  );
}

/**
 * Compute weighted GPA from a distribution of grade counts.
 * "Other" grades (withdrawals, incompletes) are excluded from GPA calculation
 * because they do not carry quality points at UT Austin.
 *
 * Returns 0 if no graded students exist.
 */
export function computeGpaFromDistribution(
  distribution: Record<string, number>
): number {
  let totalPoints = 0;
  let totalGraded = 0;

  for (const [grade, count] of Object.entries(distribution)) {
    if (grade === 'Other') continue;
    if (!(grade in GPA_POINTS)) continue;
    const pts = GPA_POINTS[grade];
    totalPoints += pts * count;
    totalGraded += count;
  }

  if (totalGraded === 0) return 0;
  return Math.round((totalPoints / totalGraded) * 1000) / 1000;
}

/**
 * Sum grade distributions across all sections of a course.
 * Returns an aggregate `Record<string, number>` over all GRADE_LETTERS.
 */
export function aggregateSectionDistributions(
  courseDist: GradeDistribution
): Record<string, number> {
  const agg: Record<string, number> = {};
  for (const letter of GRADE_LETTERS) {
    agg[letter] = 0;
  }

  for (const sec of courseDist.sections) {
    for (const letter of GRADE_LETTERS) {
      agg[letter] = (agg[letter] ?? 0) + (sec.grades[letter] ?? 0);
    }
  }

  return agg;
}

/**
 * Build the `byInstructor` map for a single course entry.
 *
 * @param courseDist   - Current GradeDistribution entry for the course
 * @param sectionInstructors - Array of instructor name strings from
 *   fall-2026-sections.json for this course. Empty/whitespace names become
 *   "Unknown".
 *
 * Strategy (documented limitation):
 *   Because the UTGradesPlus CSVs lack instructor columns we cannot derive
 *   true per-instructor historical grades. Instead we:
 *   1. Count sections per instructor (from fall-2026-sections.json)
 *   2. Proportionally attribute the course-level aggregate distribution
 *      to each instructor by section-count ratio
 *   3. avg_gpa is the course-level avg_gpa for all instructors (best estimate)
 *
 * Sections with blank instructor names → "Unknown" bucket.
 * Returns {} if sectionInstructors is empty.
 */
export function buildByInstructor(
  courseDist: GradeDistribution,
  sectionInstructors: string[]
): Record<string, InstructorGradeStats> {
  if (sectionInstructors.length === 0) return {};

  // Count sections per instructor
  const sectionCounts = new Map<string, number>();
  for (const raw of sectionInstructors) {
    const name = raw.trim() || 'Unknown';
    sectionCounts.set(name, (sectionCounts.get(name) ?? 0) + 1);
  }

  const totalSections = Array.from(sectionCounts.values()).reduce(
    (a, b) => a + b,
    0
  );

  // Aggregate the full grade distribution across all sections
  const aggDist = aggregateSectionDistributions(courseDist);

  const result: Record<string, InstructorGradeStats> = {};

  for (const [name, count] of sectionCounts) {
    const ratio = count / totalSections;

    // Proportional distribution (rounded)
    const distribution: Record<string, number> = {};
    for (const letter of GRADE_LETTERS) {
      distribution[letter] = Math.round((aggDist[letter] ?? 0) * ratio);
    }

    // Use course avg_gpa as estimate; enrollment proportional
    result[name] = {
      avg_gpa: courseDist.avg_gpa,
      total_enrollment: Math.round(courseDist.total_enrollment * ratio),
      distribution,
    };
  }

  return result;
}
