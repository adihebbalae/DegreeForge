import type { CourseCatalog, PrereqNode, CourseCategory, UserProfile } from '../types';

// ─── Category Inference ───────────────────────────────────────────────────────

/**
 * Course-ID prefixes that map to the gen_ed (amber) category.
 * 'E' = UT Austin English dept (E 316L Humanities, E 316M, etc.) — NOT ECE.
 * ECE courses always carry the 'ECE' prefix after E E → ECE normalization in normalize.ts.
 * Exported so CoursePalette.tsx can stay consistent without a second definition.
 */
export const GEN_ED_PREFIXES = new Set(['CTI', 'RHE', 'UGS', 'GOV', 'HIS', 'SOC', 'PSY', 'SDS', 'WGS', 'E']);

/**
 * Infer a display category from the prereq-graph node category or course ID prefix.
 *
 * Mapping:
 *  ece_core / ece_lower → 'ece_core'  (blue)
 *  ece_upper            → 'tech_core' (green — upper-div ECE / tech core tier)
 *  M prefix             → 'math'      (purple)
 *  CTI / RHE / UGS / E → 'gen_ed'    (amber) — see GEN_ED_PREFIXES
 *  everything else      → 'elective'  (gray)
 */
export function inferCategory(
  courseId: string,
  prereqNodes: Record<string, PrereqNode>
): CourseCategory {
  const prefix = courseId.split(' ')[0];

  // Math courses by prefix (M 427J, M 325K, etc.)
  if (prefix === 'M') return 'math';

  const node = prereqNodes[courseId];
  if (node?.category) {
    const cat = node.category;
    if (cat === 'ece_core' || cat === 'ece_lower') return 'ece_core';
    if (cat === 'ece_upper') return 'tech_core';
    if (cat === 'tech_core') return 'tech_core';
    if (cat === 'gen_ed') return 'gen_ed';
    if (cat === 'elective') return 'elective';
    if (cat === 'math') return 'math';
  }

  // Fallback for ECE not in prereq graph
  if (prefix === 'ECE') return 'ece_core';

  if (GEN_ED_PREFIXES.has(prefix)) return 'gen_ed';

  return 'elective';
}

/** Tailwind classes for left-border accent per category */
export const CATEGORY_BORDER: Record<CourseCategory, string> = {
  ece_core: 'border-l-4 border-blue-500',
  tech_core: 'border-l-4 border-green-500',
  gen_ed: 'border-l-4 border-amber-500',
  elective: 'border-l-4 border-gray-400',
  math: 'border-l-4 border-purple-500',
};


// ─── Credit Hours ─────────────────────────────────────────────────────────────

/** Hardcoded credit hours for common non-catalog courses */
const CREDIT_OVERRIDES: Record<string, number> = {
  'CTI 301G': 3,
  'CTI 302': 3,
  'RHE 306': 3,
  'M 427J': 4,
  'M 325K': 3,
  'M 408C': 4,
  'M 408D': 4,
  'M 340L': 3,
  'M 341': 3,
  'M 311': 3,
  'M 362K': 3,
  'M 365C': 3,
  'M 372K': 3,
  'M 373K': 3,
  'M 374E': 3,
  'M 374M': 3,
  'M 375T': 3,
  'M 378K': 3,
  'M 383C': 3,
  'M 508M': 5,
  'M 411': 4,
  'UGS 016': 0,
};

/**
 * Build a course-id → credit_hours map from the user's transcript
 * (completed_courses + in_progress_courses). The transcript is the
 * authoritative source for what the student actually got credit for —
 * it can legitimately differ from the catalog (e.g. ECE 302 catalog
 * lists 5 hrs but a student may have earned it for 3).
 *
 * IMPORTANT: this map is used for DEGREE PROGRESS totals (X/128 hrs).
 * It intentionally includes ALL completed courses regardless of source
 * (in_residence, ap, transfer, credit_by_exam) because they all count
 * toward degree completion. Use buildTermLoadCredits for per-semester
 * course-load totals instead.
 */
export function buildTranscriptCredits(
  profile: UserProfile | null
): Record<string, number> {
  if (!profile) return {};
  const map: Record<string, number> = {};
  for (const c of profile.completed_courses ?? []) {
    map[c.course] = c.credit_hours;
  }
  for (const c of profile.in_progress_courses ?? []) {
    map[c.course] = c.credit_hours;
  }
  return map;
}

/**
 * Build a course-id → credit_hours map for per-semester TERM LOAD totals.
 *
 * Differs from buildTranscriptCredits in one critical way: AP, transfer,
 * and credit-by-exam courses are mapped to 0 credits. This prevents them
 * from inflating any semester's "N/cap hrs" course-load display — they
 * were not physically taken in a semester and would produce impossible
 * loads like "27/18 hrs" if counted. They still count toward degree
 * progress (use buildTranscriptCredits for that).
 *
 * Courses without a `source` field default to 'in_residence' (backward
 * compatibility: existing profile data without the field is treated as
 * physically taken, which is the safe assumption for UT-enrolled students).
 *
 * In-progress courses always count toward load (they are taken this term).
 */
export function buildTermLoadCredits(
  profile: UserProfile | null
): Record<string, number> {
  if (!profile) return {};
  const map: Record<string, number> = {};
  for (const c of profile.completed_courses ?? []) {
    // Absent source → treat as 'in_residence' (backward-compatible default).
    const src = c.source ?? 'in_residence';
    // Non-residence credits map to 0 so getCourseCredits returns 0 for them,
    // preventing them from inflating any semester's load total.
    map[c.course] = src === 'in_residence' ? c.credit_hours : 0;
  }
  for (const c of profile.in_progress_courses ?? []) {
    map[c.course] = c.credit_hours;
  }
  return map;
}

/**
 * Get credit hours for a course, trying sources in priority order:
 * 1. User transcript (completed/in-progress) — authoritative for past courses
 * 2. Hardcoded overrides (for non-catalog courses)
 * 3. Course catalog
 * 4. Prereq-graph node
 * 5. Default: 3
 */
export function getCourseCredits(
  courseId: string,
  catalog: CourseCatalog | null,
  prereqNodes: Record<string, PrereqNode>,
  transcriptCredits?: Record<string, number>
): number {
  if (transcriptCredits?.[courseId] !== undefined) return transcriptCredits[courseId];
  if (CREDIT_OVERRIDES[courseId] !== undefined) return CREDIT_OVERRIDES[courseId];
  const catalogEntry = catalog?.[courseId];
  if (catalogEntry?.credits !== undefined) return catalogEntry.credits;
  const node = prereqNodes[courseId];
  if (node?.credits !== undefined) return node.credits;
  return 3;
}

// ─── GPA Badge ────────────────────────────────────────────────────────────────

/** Returns Tailwind bg color class for a GPA value */
export function gpaColorClass(gpa: number | null | undefined): string {
  if (gpa === null || gpa === undefined) return 'bg-gray-400';
  if (gpa >= 3.5) return 'bg-green-500';
  if (gpa >= 3.0) return 'bg-yellow-500';
  if (gpa >= 2.5) return 'bg-orange-500';
  return 'bg-red-500';
}


/** Get course title from catalog or prereq node (fallback to course ID) */
export function getCourseTitle(
  courseId: string,
  catalog: CourseCatalog | null,
  prereqNodes: Record<string, PrereqNode>
): string {
  return catalog?.[courseId]?.title ?? prereqNodes[courseId]?.title ?? courseId;
}
