import {
  TechCoreTrack,
  MathRequirements,
  CourseCatalog,
  TechCoreCourseEntry,
  isTechCorePickOne,
} from '../types';
import { getCourseCredits } from './course-utils';

export interface WhatIfDiff {
  coursesAdded: string[];
  coursesRemoved: string[];
  creditHourDelta: number;
  semesterDelta: number; // Estimated graduation delay (+/- semesters)
}

/**
 * Extracts a flat list of "essential" required courses for a tech core track.
 * For pick-one groups, it takes the first option as a representative placeholder.
 */
function getEssentialCourses(track: TechCoreTrack): string[] {
  const courses: string[] = [];
  const req = track.required_courses;

  if (req.advanced_math) {
    courses.push(req.advanced_math.id);
  }

  req.core?.forEach((entry: TechCoreCourseEntry) => {
    if (isTechCorePickOne(entry)) {
      if (entry.options.length > 0) {
        courses.push(entry.options[0].id);
      }
    } else {
      courses.push(entry.id);
    }
  });

  if (req.core_lab) {
    if (isTechCorePickOne(req.core_lab)) {
      if (req.core_lab.options.length > 0) {
        courses.push(req.core_lab.options[0].id);
      }
    } else {
      courses.push(req.core_lab.id);
    }
  }

  if (req.required_elective) {
    courses.push(req.required_elective.id);
  }

  return courses;
}

export function computeWhatIfDiff(
  current: { techCoreId: string; mathBAToggle: boolean },
  proposed: { techCoreId: string; mathBAToggle: boolean },
  techCores: Record<string, TechCoreTrack>,
  mathReqs: MathRequirements,
  catalog: CourseCatalog,
  completedCourses: string[]
): WhatIfDiff {
  const currentTrack = techCores[current.techCoreId];
  const proposedTrack = techCores[proposed.techCoreId];

  if (!currentTrack || !proposedTrack) {
    return { coursesAdded: [], coursesRemoved: [], creditHourDelta: 0, semesterDelta: 0 };
  }

  const currentEssential = new Set(getEssentialCourses(currentTrack));
  const proposedEssential = new Set(getEssentialCourses(proposedTrack));

  // Math BA "example" additional courses
  const mathBaCourses = mathReqs.math_ba.additional_courses_needed.breakdown.map(b => b.example);

  if (current.mathBAToggle) {
    mathBaCourses.forEach(c => currentEssential.add(c));
  }
  if (proposed.mathBAToggle) {
    mathBaCourses.forEach(c => proposedEssential.add(c));
  }

  // Calculate added/removed, excluding completed courses
  const coursesAdded = [...proposedEssential].filter(
    c => !currentEssential.has(c) && !completedCourses.includes(c)
  );
  const coursesRemoved = [...currentEssential].filter(
    c => !proposedEssential.has(c) && !completedCourses.includes(c)
  );

  // D7: use getCourseCredits for consistent credit lookup (prereqNodes not available here,
  // so pass empty object — catalog is the primary source in what-if context)
  const addedHours = coursesAdded.reduce(
    (sum, id) => sum + getCourseCredits(id, catalog, {}),
    0
  );

  const removedHours = coursesRemoved.reduce(
    (sum, id) => sum + getCourseCredits(id, catalog, {}),
    0
  );

  const creditHourDelta = addedHours - removedHours;

  // Semester delta: rough estimate (creditDelta / 15), rounded to nearest 0.5
  // e.g. 6 hours -> 0.5 semesters, 12 hours -> 1.0 semesters, 18 hours -> 1.5 semesters
  const rawSemesterDelta = creditHourDelta / 15;
  const semesterDelta = Math.round(rawSemesterDelta * 2) / 2;

  return {
    coursesAdded,
    coursesRemoved,
    creditHourDelta,
    semesterDelta
  };
}
