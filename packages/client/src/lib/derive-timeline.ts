import type { Semester, UserProfile } from '../types';

/**
 * Returns true when a completed course entry was NOT physically taken in a UT
 * residence semester (AP, transfer, credit-by-exam). These courses count toward
 * degree progress but must NOT be placed into any semester tile on the planner
 * grid — they have no real UT term and would otherwise be dumped into the
 * earliest past semester (the old broken behavior).
 *
 * Mirrors the same logic in course-utils.ts `isNonResidenceCourse` (kept local
 * here to avoid a cross-lib dependency; the two must stay in sync if types grow).
 */
function isNonResidenceCompletedCourse(cc: UserProfile['completed_courses'][number]): boolean {
  const src = cc.source ?? 'in_residence';
  if (src !== 'in_residence') return true;
  const typ = (cc.type ?? '').toLowerCase();
  return (
    typ === 'transfer' ||
    typ === 'credit by exam' ||
    typ === 'ap' ||
    typ === 'advanced placement' ||
    typ === 'dual enrollment'
  );
}

/**
 * Derive a timeline plan from a profile's completed and in-progress courses.
 *
 * - Non-residence completed courses (AP / transfer / credit_by_exam) are EXCLUDED
 *   from the plan entirely — they have no UT term and belong in the dedicated
 *   "Transfer & Exam Credit" section rendered outside the year grid.
 * - Each in-residence completed course is placed into its matching past semester
 *   by `course.semester`. If no matching past/current semester exists AND the
 *   course has no UT term (semester not in the grid), it is also excluded (same
 *   rationale: no UT term = no tile). If it HAS a semester string that just
 *   doesn't match, it falls back to the earliest past semester so old profiles
 *   that mis-tagged an in-residence course still render somewhere sensible.
 * - Each in-progress course is placed into its matching past/current semester by
 *   `course.semester`. (Honoring an explicit past match keeps placement stable as
 *   the canonical "current" term drifts forward over real time.) If no past/current
 *   match, falls back to the first current semester, then earliest future.
 * - Future semesters are left empty.
 * - Courses are deduplicated within each semester (profile might have duplicates
 *   from import errors).
 *
 * Returns a Record<semesterId, courseId[]> with an entry for every semester in the list.
 */
export function deriveTimelinePlanFromProfile(
  profile: UserProfile,
  semesters: Semester[]
): Record<string, string[]> {
  // Initialize every semester to an empty array
  const plan: Record<string, string[]> = {};
  for (const sem of semesters) {
    plan[sem.id] = [];
  }

  const pastIds = semesters.filter((s) => s.status === 'past').map((s) => s.id);
  const currentIds = semesters.filter((s) => s.status === 'current').map((s) => s.id);
  const allSemesterIds = new Set(semesters.map((s) => s.id));

  // Earliest past semester as final fallback for completed courses
  const earliestPast: string | undefined = pastIds[0];
  // First current semester as fallback for in-progress
  const firstCurrent: string | undefined = currentIds[0];
  // Earliest future as last-resort fallback
  const firstFuture: string | undefined = semesters.find((s) => s.status === 'future')?.id;

  // Place completed courses into past/current semesters.
  // Non-residence courses (AP / transfer / credit_by_exam) are skipped entirely —
  // they are displayed in the dedicated TransferCreditSection outside the grid.
  for (const cc of profile.completed_courses) {
    // Skip non-residence credit — it has no UT term.
    if (isNonResidenceCompletedCourse(cc)) continue;

    const courseId = cc.course;
    // Find matching past or current semester
    let targetSem: string | undefined;
    if (allSemesterIds.has(cc.semester)) {
      const sem = semesters.find((s) => s.id === cc.semester);
      if (sem && (sem.status === 'past' || sem.status === 'current')) {
        targetSem = cc.semester;
      }
    }
    // Fallback: earliest past semester (covers in-residence courses whose
    // recorded semester is not in the current grid, e.g. a term before the
    // planner window).
    if (!targetSem) {
      targetSem = earliestPast;
    }
    if (targetSem && !plan[targetSem].includes(courseId)) {
      plan[targetSem].push(courseId);
    }
  }

  // Place in-progress courses into the current semester
  for (const ip of profile.in_progress_courses) {
    const courseId = ip.course;
    let targetSem: string | undefined;
    if (allSemesterIds.has(ip.semester)) {
      const sem = semesters.find((s) => s.id === ip.semester);
      if (sem && (sem.status === 'past' || sem.status === 'current')) {
        targetSem = ip.semester;
      }
    }
    // Fallback: first current, then earliest future
    if (!targetSem) {
      targetSem = firstCurrent ?? firstFuture;
    }
    if (targetSem && !plan[targetSem].includes(courseId)) {
      plan[targetSem].push(courseId);
    }
  }

  return plan;
}
