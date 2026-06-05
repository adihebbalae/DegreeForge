// ─── Plan Diff Engine ─────────────────────────────────────────────────────────
// Pure functions for computing the difference between two degree plans.

/**
 * Represents the diff between two plans (A → B).
 *
 * - `added`:   courses in B but not in A (any semester)
 * - `removed`: courses in A but not in B (any semester)
 * - `moved`:   courses present in both plans but placed in different semesters
 */
export interface PlanDiff {
  added: Array<{ courseId: string; semester: string }>;
  removed: Array<{ courseId: string; semester: string }>;
  moved: Array<{ courseId: string; fromSemester: string; toSemester: string }>;
}

/**
 * Build an inverted index: courseId → semester.
 * If a course appears in multiple semesters (shouldn't normally happen),
 * the first occurrence wins.
 */
function buildCourseIndex(plan: Record<string, string[]>): Map<string, string> {
  const index = new Map<string, string>();
  for (const [semester, courses] of Object.entries(plan)) {
    for (const courseId of courses) {
      if (!index.has(courseId)) {
        index.set(courseId, semester);
      }
    }
  }
  return index;
}

/**
 * Compute the diff between two degree plans.
 *
 * @param planA - The "before" plan (e.g. a saved snapshot)
 * @param planB - The "after" plan (e.g. the current plan or another snapshot)
 * @returns A `PlanDiff` describing the differences
 */
export function computePlanDiff(
  planA: Record<string, string[]>,
  planB: Record<string, string[]>,
): PlanDiff {
  const indexA = buildCourseIndex(planA);
  const indexB = buildCourseIndex(planB);

  const added: PlanDiff['added'] = [];
  const removed: PlanDiff['removed'] = [];
  const moved: PlanDiff['moved'] = [];

  // Courses in A but not in B → removed
  // Courses in both but different semesters → moved
  for (const [courseId, semesterA] of indexA) {
    const semesterB = indexB.get(courseId);
    if (semesterB === undefined) {
      removed.push({ courseId, semester: semesterA });
    } else if (semesterB !== semesterA) {
      moved.push({ courseId, fromSemester: semesterA, toSemester: semesterB });
    }
    // else: same semester in both → no diff
  }

  // Courses in B but not in A → added
  for (const [courseId, semesterB] of indexB) {
    if (!indexA.has(courseId)) {
      added.push({ courseId, semester: semesterB });
    }
  }

  return { added, removed, moved };
}
