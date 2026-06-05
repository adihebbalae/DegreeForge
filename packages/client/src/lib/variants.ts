/**
 * variants.ts
 *
 * Shared variant-expansion and semester-placement helpers.
 * Extracted from auto-planner.ts so solver.ts can use the same logic
 * without duplicating it (D6: shared LEGACY_TO_CANONICAL).
 *
 * Variant-awareness means: completing ECE 312H satisfies any prereq that
 * names ECE 312, ECE 412, or C S 312, because they are all equivalent forms
 * of the same course. This is critical for correct prereq/coreq checking in
 * both the ghost-plan solver and the full auto-planner.
 *
 * Pure TypeScript — no React, no I/O, no side effects.
 */

import { LEGACY_TO_CANONICAL } from './catalog-rename';
import type { DegreeRequirements, Plan, Semester } from '../types';

// ─── Transfer-credit equivalency tables ──────────────────────────────────────

/** Transfer-credit / dual-enrollment equivalents that satisfy UT courses. */
export const TRANSFER_EQUIVALENTS: Record<string, string[]> = {
  'M 411': ['M 340L'],
  'M 508M': ['M 408C', 'M 408D'],
};

/**
 * Symmetric cross-department / cross-listed equivalents.
 * The prereq graph encodes "OR" alternatives as multiple AND edges (data limitation),
 * so we treat these as mutual variants — completing one satisfies any prereq that
 * names any of the others. Combined with the transitive expansion loop, this lets
 * a course's "satisfied set" cover all forms the prereq graph might reference.
 */
export const COURSE_EQUIVALENTS: Record<string, string[]> = {
  // Intro to Computing — cross-listed across BME, CS, ECE
  'ECE 306':  ['BME 306', 'C S 429'],
  'ECE 306H': ['BME 306', 'C S 429'],
  'BME 306':  ['ECE 306', 'ECE 306H', 'C S 429'],
  'C S 429':  ['ECE 306', 'ECE 306H', 'BME 306'],
  // Software Design — ECE 312 cross-listed with C S 312
  'ECE 312':  ['C S 312'],
  'ECE 312H': ['C S 312'],
  'C S 312':  ['ECE 312', 'ECE 312H'],
  // Discrete Math — M 325K and C S 311 cover the same material
  'M 325K':   ['C S 311'],
  'C S 311':  ['M 325K'],
  // Embedded Systems — BME 311 is the BME version of ECE 319K/319H
  'BME 311':  ['ECE 319K', 'ECE 319H'],
  'ECE 319K': ['BME 311'],
  'ECE 319H': ['BME 311'],
  // Engineering Ethics — BME 333T and ECE 333T are cross-listed
  'BME 333T': ['ECE 333T'],
  'ECE 333T': ['BME 333T'],
  // Data Structures — ECE 422C cross-listed with C S 314 (and honors variant)
  'ECE 422C': ['C S 314', 'C S 314H'],
  'C S 314':  ['ECE 422C', 'C S 314H'],
  'C S 314H': ['ECE 422C', 'C S 314'],
};

/**
 * Expand a course to all forms that satisfy the same requirement, transitively.
 * Iterates to fixpoint so equivalents-of-equivalents are captured:
 *   ECE 306 (legacy) -> ECE 406 (canonical) -> ECE 306H (honors) -> BME 306, C S 429.
 */
export function expandVariants(
  courseId: string,
  degreeReqs: DegreeRequirements
): string[] {
  const out = new Set<string>([courseId]);
  const honors = degreeReqs.ece_core.honors_variants ?? {};

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Array.from(out)) {
      // legacy -> canonical (D6: shared LEGACY_TO_CANONICAL)
      const canonical = LEGACY_TO_CANONICAL[id];
      if (canonical && !out.has(canonical)) {
        out.add(canonical);
        changed = true;
      }
      // canonical -> legacy
      for (const [legacy, canon] of Object.entries(LEGACY_TO_CANONICAL)) {
        if (canon === id && !out.has(legacy)) {
          out.add(legacy);
          changed = true;
        }
      }
      // canonical -> honors
      const honorsId = honors[id];
      if (honorsId && !out.has(honorsId)) {
        out.add(honorsId);
        changed = true;
      }
      // honors -> canonical
      for (const [canon, hId] of Object.entries(honors)) {
        if (hId === id && !out.has(canon)) {
          out.add(canon);
          changed = true;
        }
      }
      // Transfer equivalents
      const transfer = TRANSFER_EQUIVALENTS[id];
      if (transfer) {
        for (const eq of transfer) {
          if (!out.has(eq)) {
            out.add(eq);
            changed = true;
          }
        }
      }
      // Cross-dept equivalents
      const cross = COURSE_EQUIVALENTS[id];
      if (cross) {
        for (const eq of cross) {
          if (!out.has(eq)) {
            out.add(eq);
            changed = true;
          }
        }
      }
    }
  }
  return Array.from(out);
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
