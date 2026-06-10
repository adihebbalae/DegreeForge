import type { Semester, UserProfile } from '../types';

/**
 * Derive a timeline plan from a profile's completed and in-progress courses.
 *
 * - Each completed course is placed into its matching past semester by `course.semester`.
 *   If no matching past/current semester exists, it falls back to the earliest past semester.
 * - Each in-progress course is placed into its matching current semester by `course.semester`.
 *   If no match, falls back to the first current semester, then earliest future.
 * - Future semesters are left empty.
 * - Courses are deduplicated within each semester (profile might have duplicates from
 *   import errors).
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

  // Place completed courses into past/current semesters
  for (const cc of profile.completed_courses) {
    const courseId = cc.course;
    // Find matching past or current semester
    let targetSem: string | undefined;
    if (allSemesterIds.has(cc.semester)) {
      const sem = semesters.find((s) => s.id === cc.semester);
      if (sem && (sem.status === 'past' || sem.status === 'current')) {
        targetSem = cc.semester;
      }
    }
    // Fallback: earliest past semester
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
      if (sem && sem.status === 'current') {
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
