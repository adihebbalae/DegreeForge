/**
 * requirements.ts
 *
 * Builds the flat list of all required courses for a BSECE degree
 * given a tech core selection and Math BA toggle.
 *
 * Pure TypeScript — no React, no side effects.
 */

import type {
  DegreeRequirements,
  TechCores,
  TechCoreTrack,
  TechCoreCourseEntry,
  MathRequirements,
  UserProfile,
} from '../types';
import { isTechCorePickOne } from '../types';
// ─── Unified equivalence map ─────────────────────────────────────────────────
//
// Three original sources merged into one:
//   1. Honors variants (HONORS_EQUIVALENTS): ECE 306 ≡ ECE 306H
//   2. Legacy catalog renames: ECE 302 ≡ ECE 402
//   3. ECE/BME cross-lists: ECE 306 ≡ BME 306, ECE 333T ≡ BME 333T, etc.
//
// Structure: canonical (or representative) course → all equivalent course IDs
// (including itself and any variant). Any course in the completed set that maps
// to the same equivalence class satisfies the requirement.
//
// The map is intentionally bidirectional: if A→[B,C], then B→[A,C] and C→[A,B]
// are generated at module load time so callers don't need to know the canonical form.

const EQUIVALENCE_GROUPS: string[][] = [
  // ECE 302 family (intro EE + 2026 rename)
  ['ECE 302', 'ECE 302H', 'ECE 402'],
  // ECE 306 / BME 306 family (intro computing + honors + cross-list)
  ['ECE 306', 'ECE 306H', 'BME 306', 'ECE 406'],
  // ECE 312 family (software design + honors + 2026 rename)
  ['ECE 312', 'ECE 312H', 'ECE 412'],
  // ECE 319K / ECE 319H family (embedded + 2026 rename)
  ['ECE 319K', 'ECE 319H', 'ECE 419K'],
  // ECE 333T / BME 333T family (technical communication cross-list)
  ['ECE 333T', 'BME 333T'],
  // BME 311 / ECE equivalent (circuits cross-list, used as 311 prereq in data)
  ['BME 311', 'ECE 311'],
];

/**
 * Flat lookup: course ID → Set of all course IDs that are equivalent to it
 * (including itself). Built once at module load from EQUIVALENCE_GROUPS.
 */
export const EQUIVALENCE_MAP: ReadonlyMap<string, ReadonlySet<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of EQUIVALENCE_GROUPS) {
    const groupSet = new Set(group);
    for (const id of group) {
      // Merge with any existing set (handles overlap between groups if any)
      const existing = map.get(id);
      if (existing) {
        for (const g of groupSet) existing.add(g);
      } else {
        map.set(id, new Set(groupSet));
      }
    }
  }
  return map;
})();

/**
 * Check if a requirement is satisfied by any course in the completed set,
 * accounting for honors variants, legacy catalog renames, and cross-listed
 * equivalences (ECE/BME cross-lists).
 *
 * Called by: graph-engine.ts validatePlacement (CNF OR-group semantics,
 *            TASK-057+), buildRemainingRequirements filter, auto-planner
 *            satisfied check.
 */
export function isRequirementSatisfied(
  requiredCourse: string,
  completedSet: Set<string>
): boolean {
  if (completedSet.has(requiredCourse)) return true;
  // Check equivalence group: any equivalent course in completedSet satisfies the requirement
  const equivalents = EQUIVALENCE_MAP.get(requiredCourse);
  if (equivalents) {
    for (const eq of equivalents) {
      if (completedSet.has(eq)) return true;
    }
  }
  return false;
}

/**
 * Extract all required course IDs from a tech core track.
 * For pick-one groups, takes the first option as default.
 */
export function getTechCoreCourses(track: TechCoreTrack): string[] {
  const courses: string[] = [];
  const req = track.required_courses;

  // Advanced math
  if (req.advanced_math) {
    courses.push(req.advanced_math.id);
  }

  // Core courses
  req.core?.forEach((entry: TechCoreCourseEntry) => {
    if (isTechCorePickOne(entry)) {
      if (entry.options.length > 0) {
        courses.push(entry.options[0].id);
      }
    } else {
      courses.push(entry.id);
    }
  });

  // Core lab
  if (req.core_lab) {
    if (isTechCorePickOne(req.core_lab)) {
      if (req.core_lab.options.length > 0) {
        courses.push(req.core_lab.options[0].id);
      }
    } else {
      courses.push(req.core_lab.id);
    }
  }

  // S4: required_elective is typed as TechCourseRef — single required course only
  if (req.required_elective) {
    courses.push(req.required_elective.id);
  }

  return courses;
}

/**
 * Get elective pool courses from a tech core track,
 * excluding courses that are already required.
 */
export function getTechCoreElectives(
  track: TechCoreTrack,
  requiredCourses: Set<string>,
  count: number
): string[] {
  return track.elective_pool
    .filter((id) => !requiredCourses.has(id))
    .slice(0, count);
}

/**
 * Build the complete list of remaining required courses for a BSECE degree.
 *
 * @param degreeReqs - degree-requirements.json
 * @param techCores - tech-cores.json
 * @param techCoreId - slug of the selected tech core track
 * @param mathBA - whether Math BA double major is enabled
 * @param mathReqs - math-requirements.json
 * @param profile - user-profile.json
 * @returns flat array of course IDs still needed
 */
export function buildRemainingRequirements(
  degreeReqs: DegreeRequirements,
  techCores: TechCores,
  techCoreId: string,
  mathBA: boolean,
  mathReqs: MathRequirements | null,
  profile: UserProfile
): string[] {
  const completed = new Set<string>([
    ...profile.completed_courses.map((c) => c.course),
    ...profile.in_progress_courses.map((c) => c.course),
  ]);

  const allRequired = new Set<string>();

  // 1. ECE Core courses
  for (const course of degreeReqs.ece_core.courses) {
    allRequired.add(course);
  }

  // 2. Math sequence
  for (const course of degreeReqs.math_sequence.required) {
    allRequired.add(course);
  }

  // 3. Physics sequence
  for (const course of degreeReqs.physics_sequence.required) {
    allRequired.add(course);
  }

  // 4. Tech core courses
  const track = techCores[techCoreId];
  if (track) {
    const techRequired = getTechCoreCourses(track);
    for (const course of techRequired) {
      allRequired.add(course);
    }

    // Tech core electives — pick from pool
    const electiveCount = track.elective_count.general;
    const electives = getTechCoreElectives(track, allRequired, electiveCount);
    for (const course of electives) {
      allRequired.add(course);
    }
  }

  // 5. Core curriculum gen ed — use first option from each slot
  for (const slot of degreeReqs.core_curriculum.slots) {
    if (slot.options.length > 0 && slot.options[0] !== 'list_of_approved' && slot.options[0] !== 'same_as_his1') {
      allRequired.add(slot.options[0]);
    }
  }

  // 6. Math BA additional courses (if enabled)
  if (mathBA && mathReqs) {
    for (const item of mathReqs.math_ba.additional_courses_needed.breakdown) {
      if (item.example) {
        allRequired.add(item.example);
      }
    }
  }

  // Filter out completed/in-progress courses
  const remaining = [...allRequired].filter(
    (course) => !isRequirementSatisfied(course, completed)
  );

  return remaining;
}
