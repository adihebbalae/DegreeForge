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

// ─── Honors variant mapping ──────────────────────────────────────────────────
// Old course number → honors replacement (what Adi actually takes)
// AND new catalog number → honors replacement
const HONORS_EQUIVALENTS: Record<string, string[]> = {
  'ECE 302':  ['ECE 302H'],
  'ECE 402':  ['ECE 302', 'ECE 302H'],   // 402 is 2026 catalog version of 302
  'ECE 306':  ['ECE 306H'],
  'ECE 406':  ['ECE 306', 'ECE 306H'],
  'ECE 312':  ['ECE 312H'],
  'ECE 412':  ['ECE 312', 'ECE 312H'],
  'ECE 319K': ['ECE 319H'],
  'ECE 419K': ['ECE 319K', 'ECE 319H'],
};

/**
 * Check if a requirement is satisfied by any course in the completed set,
 * accounting for honors variants and old/new catalog number equivalences.
 */
export function isRequirementSatisfied(
  requiredCourse: string,
  completedSet: Set<string>
): boolean {
  if (completedSet.has(requiredCourse)) return true;
  const equivalents = HONORS_EQUIVALENTS[requiredCourse];
  if (equivalents) {
    return equivalents.some((eq) => completedSet.has(eq));
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

  // Required elective — can be a single course ref or a pick-one group
  if (req.required_elective) {
    if ('options' in req.required_elective) {
      // It's a pick-one group
      const pickOne = req.required_elective as unknown as { options: { id: string }[]; pick: number };
      if (pickOne.options?.length > 0) {
        courses.push(pickOne.options[0].id);
      }
    } else {
      courses.push(req.required_elective.id);
    }
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
