export interface SkillCourseMapEntry {
  label: string;
  courses: string[];
  relevance: 'strong' | 'moderate';
}

export type SkillCourseMap = Record<string, SkillCourseMapEntry>;

export interface RankedCourse {
  courseId: string;
  matchingSkills: string[];
  score: number;
  why: string;
}

export function rankCoursesForSkills(
  skills: string[],
  skillMap: SkillCourseMap,
  existingCourses: string[] = []
): RankedCourse[] {
  const courseMap = new Map<string, { matchingSkills: string[], score: number }>();

  // Map each requested skill
  for (const skill of skills) {
    const entry = skillMap[skill];
    if (!entry) continue;

    const skillScore = entry.relevance === 'strong' ? 2 : 1;
    
    for (const courseId of entry.courses) {
      if (!courseMap.has(courseId)) {
        courseMap.set(courseId, { matchingSkills: [], score: 0 });
      }
      const data = courseMap.get(courseId)!;
      data.matchingSkills.push(entry.label);
      data.score += skillScore;
    }
  }

  const results: RankedCourse[] = [];
  for (const [courseId, data] of courseMap.entries()) {
    const isExisting = existingCourses.includes(courseId);
    
    let why = `Matches ${data.matchingSkills.join(', ')}.`;
    let score = data.score;
    
    if (isExisting) {
      score = 0;
      why = 'Already planned';
    }

    results.push({
      courseId,
      matchingSkills: data.matchingSkills,
      score,
      why
    });
  }

  // Sort descending by score, then alphabetically by courseId for stability
  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.courseId.localeCompare(b.courseId);
  });
}

/**
 * Builds a snapshot plan by cloning the current plan and appending the top
 * recommended courses (excluding ones already planned) into the target semester.
 *
 * @param currentPlan    The live plan (semesterId → courseId[])
 * @param ranked         Ranked course recommendations from rankCoursesForSkills
 * @param futureSemesterId  The semester id to append recommendations into
 * @param max            Maximum number of recommendations to add (default 3)
 * @returns A new plan object (deep clone — does not mutate currentPlan)
 */
export function buildSnapshotPlan(
  currentPlan: Record<string, string[]>,
  ranked: RankedCourse[],
  futureSemesterId: string,
  max = 3
): Record<string, string[]> {
  // Deep clone each semester's array
  const snapshot: Record<string, string[]> = Object.fromEntries(
    Object.entries(currentPlan).map(([k, v]) => [k, [...v]])
  );

  // Collect all course ids already anywhere in the plan for dedup
  const allPlanned = new Set(Object.values(snapshot).flat());

  // Take top `max` non-"Already planned" courses
  const recommendations = ranked
    .filter(rc => rc.why !== 'Already planned')
    .slice(0, max)
    .map(rc => rc.courseId);

  // Ensure the target semester slot exists
  if (!snapshot[futureSemesterId]) {
    snapshot[futureSemesterId] = [];
  }

  for (const courseId of recommendations) {
    if (!allPlanned.has(courseId)) {
      snapshot[futureSemesterId].push(courseId);
      allPlanned.add(courseId);
    }
  }

  return snapshot;
}
