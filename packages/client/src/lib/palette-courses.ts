// ─── Equivalency Map ─────────────────────────────────────────────────────────
//
// Maps a canonical course ID → alternative IDs that satisfy the same requirement.
// Used so that e.g. completing old-number ECE 302 satisfies ECE 402, or
// honors-section ECE 312H satisfies ECE 412.

export const COURSE_EQUIVALENCIES: Record<string, string[]> = {
  // New 2026-2028 catalog numbers → old / honors alternatives
  'ECE 402': ['ECE 302', 'ECE 302H'],
  'ECE 406': ['ECE 306', 'ECE 306H'],
  'ECE 412': ['ECE 312', 'ECE 312H'],
  'ECE 419K': ['ECE 319K', 'ECE 319H'],
  // Math: M 508M is a transfer dual-credit covering both 408C and 408D
  'M 408D': ['M 508M', 'M 408M', 'M 408S'],
  // Linear algebra: M 411 transfer covers M 340L / M 341
  'M 340L': ['M 411', 'M 341'],
};

/** True if courseId is satisfied (directly or via an equivalency) in the given set. */
export function isCourseSatisfied(courseId: string, satisfiedSet: Set<string>): boolean {
  if (satisfiedSet.has(courseId)) return true;
  const alts = COURSE_EQUIVALENCIES[courseId];
  return alts?.some((alt) => satisfiedSet.has(alt)) ?? false;
}

// ─── Static course lists ──────────────────────────────────────────────────────

/**
 * Representative Gen Ed courses — one concrete option per core slot that has
 * a fixed course ID.  Slots that say "list_of_approved" (VAPA, SBS) are omitted
 * because there is no single recommended course.
 *
 * Every prefix used here must exist in GEN_ED_PREFIXES (course-utils.ts) so that
 * timeline cards for these courses color as gen-ed (amber) rather than elective (gray).
 * E 316L uses the 'E' (English) prefix — which was added to GEN_ED_PREFIXES for this.
 */
export const GEN_ED_REPRESENTATIVE = [
  'UGS 302', // First-Year Signature Course (Core 090)
  // RHE 306 is satisfied by credit-by-exam — excluded
  'E 316L',  // Humanities (Core 040) — first option; prefix 'E' is in GEN_ED_PREFIXES
  'HIS 315K', // US History I (Core 060)
  'HIS 315L', // US History II (Core 060)
  'GOV 310L', // American Government I (Core 070)
  'GOV 312L', // American Government II (Core 070)
];

/** Required physics lab sequence (corequisites with lecture sections). */
export const PHYSICS_COURSES = ['PHY 303K', 'PHY 105M', 'PHY 303L', 'PHY 105N'];

/**
 * Math courses relevant for the Math BA double-major Adi is considering,
 * beyond what the BSECE already requires.
 */
export const MATH_BA_ADDITIONAL = [
  'M 361K', // Real Analysis I (Math BA: real_analysis option)
  'M 365C', // Real Analysis I alternate
  'M 362K', // Probability I (Math BA: probability)
  'M 374M', // Numerical Analysis: Linear Algebra (Math BA: broadening)
  'M 378K', // Introduction to Mathematical Statistics (Math BA: broadening)
  'M 368K', // Numerical Methods for Applications (Math BA: broadening)
];
