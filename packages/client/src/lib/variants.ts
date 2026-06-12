/**
 * variants.ts
 *
 * Variant-expansion and semester-placement helpers for the solver side.
 *
 * Variant-awareness means: completing ECE 312H satisfies any prereq that
 * names ECE 312, ECE 412, or C S 312, because they are all equivalent forms
 * of the same course. This is critical for correct prereq/coreq checking in
 * both the ghost-plan solver and the full auto-planner.
 *
 * E3: membership is defined by THE equivalence registry (lib/equivalence.ts)
 * — the same registry that drives prereq-check satisfaction
 * (requirements.isRequirementSatisfied) and progress counting, so the solver
 * can never disagree with them. The former local COURSE_EQUIVALENTS /
 * TRANSFER_EQUIVALENTS tables live there now.
 *
 * Pure TypeScript — no React, no I/O, no side effects.
 */

import { getEquivalenceRegistry, expandSatisfied } from './equivalence';
import type { DegreeRequirements, Plan, Semester } from '../types';

/**
 * Expand a course to all forms that satisfy the same requirement, transitively:
 *   ECE 306 (legacy) -> ECE 406 (canonical) -> ECE 306H (honors) -> BME 306, C S 429.
 * Directional transfer credit expands forward only (M 411 -> M 340L, never back).
 */
export function expandVariants(
  courseId: string,
  degreeReqs: DegreeRequirements
): string[] {
  return expandSatisfied(courseId, getEquivalenceRegistry(degreeReqs));
}

export function addWithVariants(
  set: Set<string>,
  courseId: string,
  degreeReqs: DegreeRequirements
): void {
  for (const v of expandVariants(courseId, degreeReqs)) set.add(v);
}

/**
 * True if any variant of courseId is placed in a semester STRICTLY BEFORE semIndex.
 */
export function isInPriorSemester(
  courseId: string,
  semIndex: number,
  semesters: Semester[],
  plan: Plan,
  variants: (id: string) => string[]
): boolean {
  for (let i = 0; i < semIndex; i++) {
    const placed = plan[semesters[i].id] ?? [];
    for (const c of placed) {
      if (c === courseId) return true;
      if (variants(c).includes(courseId)) return true;
    }
  }
  return false;
}

/**
 * True if any variant of courseId is placed in a semester at or before semIndex.
 */
export function isInSameOrPriorSemester(
  courseId: string,
  semIndex: number,
  semesters: Semester[],
  plan: Plan,
  variants: (id: string) => string[]
): boolean {
  for (let i = 0; i <= semIndex; i++) {
    const placed = plan[semesters[i].id] ?? [];
    for (const c of placed) {
      if (c === courseId) return true;
      if (variants(c).includes(courseId)) return true;
    }
  }
  return false;
}
