/**
 * UT Austin GPA computation — pure, local-only.
 *
 * PRIVACY: This function is called only at render time. Its output MUST
 * NEVER be passed to any analytics / track() call. The result is
 * computed and displayed locally only.
 *
 * Inclusion rules (UT Office of the Registrar):
 *  - source === 'in_residence' OR source absent/undefined (backward-compat)
 *  - Real letter grade (A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F)
 *  - Excludes: CR, NC, Q, W, IP, blank/"", and any unrecognised string
 *  - Excludes: source === 'ap' | 'transfer' | 'credit_by_exam'
 *  - Excludes: in_progress_courses entirely (not yet graded)
 *
 * Repeated courses: UT counts BOTH attempts (no grade replacement).
 * Do NOT deduplicate by course ID — include every entry independently.
 *
 * Scale (UT 4.0, no A+ bonus):
 *   A=4.0, A-=3.67, B+=3.33, B=3.0, B-=2.67,
 *   C+=2.33, C=2.0, C-=1.67, D+=1.33, D=1.0, D-=0.67, F=0.0
 */

import type { UserProfile, CreditSource } from '../types';

// ─── Authoritative UT 4.0 scale ───────────────────────────────────────────────
// No A+ bonus; F=0. All other strings are excluded from GPA.
export const UT_GRADE_POINTS: Readonly<Record<string, number>> = {
  'A':  4.0,
  'A-': 3.67,
  'B+': 3.33,
  'B':  3.0,
  'B-': 2.67,
  'C+': 2.33,
  'C':  2.0,
  'C-': 1.67,
  'D+': 1.33,
  'D':  1.0,
  'D-': 0.67,
  'F':  0.0,
};

// Set of sources that are explicitly excluded from UT GPA
const NON_RESIDENCE_SOURCES = new Set<CreditSource>(['ap', 'transfer', 'credit_by_exam']);

export interface UtGpaResult {
  /** null when zero qualifying courses */
  gpa: number | null;
  /** Total credit hours counted in the GPA (denominator) */
  gpaHours: number;
  /** Total quality points (numerator) */
  qualityPoints: number;
  /** Number of course entries included */
  includedCount: number;
}

/**
 * Compute the student's UT GPA from their completed_courses list.
 *
 * @param completedCourses - profile.completed_courses (NOT in_progress_courses)
 * @returns UtGpaResult with gpa=null when no qualifying entries exist
 */
export function computeUtGpa(
  completedCourses: UserProfile['completed_courses']
): UtGpaResult {
  let totalQualityPoints = 0;
  let totalGpaHours = 0;
  let includedCount = 0;

  for (const c of completedCourses) {
    // Exclude non-residence sources (ap / transfer / credit_by_exam)
    const src = c.source ?? 'in_residence';
    if (NON_RESIDENCE_SOURCES.has(src as CreditSource)) continue;

    // Also check the `type` field (demo profile uses type:"Transfer", type:"AP", etc.
    // with no explicit source). Mirror the logic used in isNonResidenceCourse.
    const typ = (c.type ?? '').toLowerCase();
    if (
      typ === 'transfer' ||
      typ === 'credit by exam' ||
      typ === 'ap' ||
      typ === 'advanced placement' ||
      typ === 'dual enrollment'
    ) continue;

    // Validate the grade against the UT scale
    const gradeStr = (c.grade ?? '').trim();
    if (!(gradeStr in UT_GRADE_POINTS)) continue;

    const pts = UT_GRADE_POINTS[gradeStr];
    const hrs = c.credit_hours ?? 0;
    if (hrs <= 0) continue; // zero-credit courses do not affect GPA

    totalQualityPoints += pts * hrs;
    totalGpaHours += hrs;
    includedCount++;
  }

  if (includedCount === 0) {
    return { gpa: null, gpaHours: 0, qualityPoints: 0, includedCount: 0 };
  }

  const gpa = Math.round((totalQualityPoints / totalGpaHours) * 100) / 100;

  return {
    gpa,
    gpaHours: totalGpaHours,
    qualityPoints: totalQualityPoints,
    includedCount,
  };
}
