import type { CourseCatalog, PrereqNode, CourseCategory, UserProfile, OfferingSchedule } from '../types';
import { parseCourseId } from './sanitize-course-list';

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
  const prefix = parseCourseId(courseId)?.prefix;
  if (!prefix) return 'elective';

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
  ece_core: 'border-l-4 border-[hsl(16_70%_50%)]',
  tech_core: 'border-l-4 border-[hsl(85_50%_42%)]',
  gen_ed: 'border-l-4 border-[hsl(40_72%_47%)]',
  elective: 'border-l-4 border-[hsl(220_8%_55%)]',
  math: 'border-l-4 border-[hsl(255_38%_58%)]',
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
/**
 * Returns true when a completed course entry should NOT count toward per-semester
 * term load (i.e. it was not physically taken in a UT residence semester).
 *
 * Checks BOTH `source` (API field used by some profiles) and `type` (field used by
 * the demo profile — "Transfer", "Credit by exam", "AP"). Either one is sufficient
 * to exclude the course from term-load counting. Degree-progress totals still
 * count all sources (use buildTranscriptCredits for that).
 */
function isNonResidenceCourse(c: { source?: string; type?: string }): boolean {
  const src = c.source ?? 'in_residence';
  if (src !== 'in_residence') return true;

  // The demo profile tags non-residence courses via `type` with `source`
  // defaulting to its absent/undefined value treated as 'in_residence'.
  const typ = (c.type ?? '').toLowerCase();
  return (
    typ === 'transfer' ||
    typ === 'credit by exam' ||
    typ === 'ap' ||
    typ === 'advanced placement' ||
    typ === 'dual enrollment'
  );
}

export function buildTermLoadCredits(
  profile: UserProfile | null
): Record<string, number> {
  if (!profile) return {};
  const map: Record<string, number> = {};
  for (const c of profile.completed_courses ?? []) {
    // Non-residence credits (transfer / AP / credit-by-exam) map to 0 so they
    // don't inflate any semester's "N/cap hrs" term-load display.
    map[c.course] = isNonResidenceCourse(c) ? 0 : c.credit_hours;
  }
  for (const c of profile.in_progress_courses ?? []) {
    map[c.course] = c.credit_hours;
  }
  return map;
}

/** Credits assumed for a course no source knows about. */
export const DEFAULT_CREDITS = 3;

/**
 * THE canonical credit accessor — every credit figure in the app must come
 * from this function. Priority order:
 * 1. User transcript (completed/in-progress) — authoritative for past courses
 * 2. Hardcoded overrides (non-catalog courses + known-bad catalog rows,
 *    see .agents/data-diffs/e1-credits.md)
 * 3. Course catalog
 * 4. Default: 3
 *
 * prerequisite-graph.json no longer carries a credits copy (it agreed with the
 * catalog on all 378 shared courses and existed only as a drift surface).
 */
export function getCourseCredits(
  courseId: string,
  catalog: CourseCatalog | null,
  transcriptCredits?: Record<string, number>
): number {
  if (typeof courseId !== 'string' || !courseId) return DEFAULT_CREDITS;
  if (transcriptCredits?.[courseId] !== undefined) return transcriptCredits[courseId];
  if (CREDIT_OVERRIDES[courseId] !== undefined) return CREDIT_OVERRIDES[courseId];
  const catalogCredits = catalog?.[courseId]?.credits;
  // null = variable-credit Topics row — fall through to the default
  if (typeof catalogCredits === 'number') return catalogCredits;
  return DEFAULT_CREDITS;
}

// ─── Offered Seasons ──────────────────────────────────────────────────────────

/**
 * THE canonical offered-seasons accessor — every offering read must come from
 * this function. offering-schedule.json is the single source (observed /
 * curated / baseline provenance per row; prerequisite-graph.json no longer
 * carries an `offered` copy — see .agents/data-diffs/e2-offering.md).
 *
 * Returns null when nothing is known (course absent or empty row) — callers
 * treat null as "may be offered any season" (open-world default).
 */
export function getOfferedSeasons(
  courseId: string,
  offeringSchedule: OfferingSchedule
): string[] | null {
  const seasons = offeringSchedule[courseId]?.offered_semesters;
  if (seasons && seasons.length > 0) return seasons;
  return null;
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
  if (typeof courseId !== 'string' || !courseId) return '';
  return catalog?.[courseId]?.title ?? prereqNodes[courseId]?.title ?? courseId;
}
