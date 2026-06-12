/**
 * sanitize-course-list.ts — TASK-061 Workstream A / TASK-064
 *
 * Single shared module for plan invariants enforced at the reducer chokepoint.
 *
 * Invariant 1 — Valid course code (TASK-061A):
 *   Plan state NEVER holds a null / undefined / non-course-code token.
 *   A valid course-code token matches /^[A-Z]+ \d+\S*$/
 *
 * Invariant 2 — No writes to past terms (TASK-064):
 *   isPastSemester(semesterId, semesters) is the single canonical predicate.
 *   ADD_COURSE, MOVE_COURSE (target), and ACCEPT_GHOST reject a past-status
 *   target in the reducer. UI layers rely on the reducer guard; they may add
 *   their own affordances (e.g. feedback messages) but must NOT duplicate the
 *   rule logic.
 *
 * Two layers are used together:
 *   A) Each source path calls sanitizeCourseList before dispatching so dropped
 *      items can be surfaced to the user with a toast / Notice.
 *   B) The PlanContext reducer calls sanitizePlan as a last-line-of-defence guard
 *      for all plan-mutating actions so plan state is structurally incapable of
 *      holding an invalid entry even if a future path forgets to sanitize.
 */

import type { Semester } from '../types';

/** Pattern matching a valid UT course code (uppercase dept, space, number + optional suffix). */
export const COURSE_CODE_RE = /^[A-Z]+ \d+\S*$/;

/** Returns true iff `id` is a valid course-code token. */
export function isValidCourseId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && COURSE_CODE_RE.test(id);
}

/** Structured parts of a course code: prefix (dept), numeric level, and optional suffix. */
export interface ParsedCourseId {
  /** Department prefix, e.g. "ECE", "M", "CTI". */
  prefix: string;
  /** Numeric level (leading digits parsed as an integer), e.g. 302, 427. */
  number: number;
  /** Anything after the leading digits, e.g. "H", "K", "L" (usually a single letter). */
  suffix: string;
}

// Matches the same shape as COURSE_CODE_RE (`[A-Z]+ \d+\S*`) but captures the
// three parts. The number is the LEADING run of digits, mirroring the historic
// `parseInt(courseId.split(' ')[1], 10)` behaviour exactly for any valid code.
const COURSE_ID_PARTS_RE = /^([A-Z]+) (\d+)(\S*)$/;

/**
 * Parse a course code into {prefix, number, suffix}, or null if it is not a
 * valid course-code token. This is the single course-identity parser — it
 * replaces the hand-rolled `split(' ')` + `parseInt` + NaN-handling that was
 * duplicated across progress.ts, workload.ts, and course-utils.ts.
 */
export function parseCourseId(id: unknown): ParsedCourseId | null {
  if (typeof id !== 'string') return null;
  const m = COURSE_ID_PARTS_RE.exec(id);
  if (!m) return null;
  return { prefix: m[1], number: parseInt(m[2], 10), suffix: m[3] };
}

export interface SanitizeCourseListResult {
  /** Only the valid course-code strings. */
  valid: string[];
  /** Every entry that was dropped (null, undefined, placeholder, etc.). */
  dropped: unknown[];
}

/**
 * Filter an array of unknown values to only valid course-code strings.
 * Returns both the valid subset and the list of dropped entries so callers
 * can surface feedback to the user.
 */
export function sanitizeCourseList(ids: unknown[]): SanitizeCourseListResult {
  const valid: string[] = [];
  const dropped: unknown[] = [];
  for (const id of ids) {
    if (isValidCourseId(id)) {
      valid.push(id);
    } else {
      dropped.push(id);
    }
  }
  return { valid, dropped };
}

/**
 * Sanitize a full plan record (semesterId → courseId[]).
 * Returns a new plan with only valid course codes and the aggregated list
 * of all dropped tokens across every semester.
 */
export function sanitizePlan(
  rawPlan: Record<string, unknown[]>
): { safePlan: Record<string, string[]>; dropped: unknown[] } {
  const safePlan: Record<string, string[]> = {};
  const allDropped: unknown[] = [];
  for (const [semId, ids] of Object.entries(rawPlan)) {
    const { valid, dropped } = sanitizeCourseList(ids);
    safePlan[semId] = valid;
    allDropped.push(...dropped);
  }
  return { safePlan, dropped: allDropped };
}

// ─── Invariant 2 — No writes to past terms ────────────────────────────────────

/**
 * Returns true iff the semester identified by `semesterId` has status 'past'.
 *
 * This is the SINGLE canonical definition of the past-term write guard.
 * ADD_COURSE, MOVE_COURSE (target), and ACCEPT_GHOST all use this predicate
 * in the reducer. UI components may surface feedback based on this predicate
 * but must NOT duplicate the rule logic.
 *
 * @param semesterId - the semester to test
 * @param semesters  - the full semester list from plan state (each has a `status` field)
 */
export function isPastSemester(semesterId: string, semesters: Semester[]): boolean {
  const sem = semesters.find((s) => s.id === semesterId);
  return sem?.status === 'past';
}
