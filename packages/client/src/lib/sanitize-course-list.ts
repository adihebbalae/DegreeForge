/**
 * sanitize-course-list.ts — TASK-061 Workstream A
 *
 * Single shared sanitizer for every path that writes courses into plan state.
 *
 * Contract: plan state NEVER holds a null / undefined / non-course-code token.
 *
 * A valid course-code token matches the pattern:
 *   /^[A-Z]+ \d+\S*$/
 * Examples that pass: "ECE 302", "ECE 312H", "M 427J", "UGS 302", "RHE 306"
 * Examples that fail: null, undefined, "", "any 2 UD math courses", "HOLD"
 *
 * Two layers are used together:
 *   A) Each source path calls sanitizeCourseList before dispatching so dropped
 *      items can be surfaced to the user with a toast / Notice.
 *   B) The PlanContext reducer calls sanitizePlan as a last-line-of-defence guard
 *      for all plan-mutating actions so plan state is structurally incapable of
 *      holding an invalid entry even if a future path forgets to sanitize.
 */

/** Pattern matching a valid UT course code (uppercase dept, space, number + optional suffix). */
export const COURSE_CODE_RE = /^[A-Z]+ \d+\S*$/;

/** Returns true iff `id` is a valid course-code token. */
export function isValidCourseId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && COURSE_CODE_RE.test(id);
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
