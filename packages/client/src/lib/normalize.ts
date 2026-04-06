import type { GradeDistribution, GradeDistributions } from '../types';

/**
 * Normalize "E E" course prefixes to "ECE".
 *
 * The UT ECE department was formerly called "Electrical Engineering" with
 * department code "E E". Historical grade-distribution data uses this old
 * prefix. All internal references must use "ECE".
 *
 * Handles:
 *   "E E 302"  → "ECE 302"
 *   "E E302"   → "ECE 302"
 *   "e e 302"  → "ECE 302"  (case-insensitive)
 *   "ECE 302"  → "ECE 302"  (unchanged)
 *   "M 340L"   → "M 340L"   (unrelated prefix — unchanged)
 */
export function normalizeEEtoECE(courseId: string): string {
  // Case 1: "E E 302" or "e e 302" (space between prefix and number)
  // Case 2: "E E302" or "e e302" (no space before number)
  return courseId
    .replace(/^[Ee]\s*[Ee]\s+/, 'ECE ')
    .replace(/^[Ee]\s*[Ee](\d)/, 'ECE $1');
}

/**
 * Normalize the department_code field: "E E" → "ECE".
 */
export function normalizeDeptCode(code: string): string {
  return /^[Ee]\s*[Ee]$/.test(code.trim()) ? 'ECE' : code;
}

/**
 * Normalize the raw grade-distributions JSON (which has the shape
 * `{ courses: Record<string, GradeDistribution> }`) into a flat
 * `Record<string, GradeDistribution>` with all "E E NNN" keys
 * converted to "ECE NNN" and department_code fields updated.
 *
 * This is the single normalization boundary — all downstream code
 * can assume "ECE" prefix only.
 */
export function normalizeGradeDistributions(raw: {
  courses: Record<string, GradeDistribution>;
}): GradeDistributions {
  const result: GradeDistributions = {};

  for (const [key, dist] of Object.entries(raw.courses)) {
    const normalizedKey = normalizeEEtoECE(key);
    result[normalizedKey] = {
      ...dist,
      department_code: normalizeDeptCode(dist.department_code),
    };
  }

  return result;
}
