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
  Semester,
  Plan,
} from '../types';
import { isTechCorePickOne } from '../types';
import { TRANSFER_EQUIVALENTS, addWithVariants } from './variants';
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
  // Check transfer equivalents (e.g. M 411 satisfies M 340L, M 508M satisfies M 408C/M 408D).
  // Reverse-lookup: if requiredCourse appears in any TRANSFER_EQUIVALENTS value list,
  // check whether the key (the transfer course) is in the completed set.
  for (const [transferId, satisfies] of Object.entries(TRANSFER_EQUIVALENTS)) {
    if (satisfies.includes(requiredCourse) && completedSet.has(transferId)) return true;
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

// ─── Canonical remaining-required computation ─────────────────────────────────

/**
 * Canonical function: build the flat list of courses the user still needs to take,
 * given a pre-built variant-expanded satisfied set.
 *
 * This is the single source of truth consumed by useDiagnostics (via
 * computeRequiredCourses in auto-planner), useGhostPlan, and run-solver.
 * All three paths must build their satisfied set via buildSatisfiedSet — which
 * includes past/current plan semesters — before calling this function.
 *
 * Key semantics that differ from the old buildRemainingRequirements:
 *   - The satisfied set is variant-expanded (honors/legacy/transfer/cross-dept).
 *   - Pick-one tech-core groups: if ANY option is in the satisfied set the slot
 *     is considered done.
 *   - Gen-ed "same_as_his1" references are resolved. CTI substitutions honoured.
 *   - list_of_approved gen-ed slots are surfaced in warnings, not silently skipped.
 */
export function computeRemainingRequired(
  degreeReqs: DegreeRequirements,
  techCore: TechCoreTrack,
  mathReqs: MathRequirements | null,
  mathBAToggle: boolean,
  satisfied: Set<string>
): { required: string[]; warnings: string[] } {
  const required = new Set<string>();
  const warnings: string[] = [];

  const need = (id: string) => {
    if (!id) return;
    if (!satisfied.has(id)) required.add(id);
  };

  // ECE core
  for (const id of degreeReqs.ece_core.courses) need(id);

  // Math sequence
  for (const id of degreeReqs.math_sequence.required) need(id);

  // Physics sequence
  for (const id of degreeReqs.physics_sequence.required) need(id);

  // Tech-core required courses
  const req = techCore.required_courses;
  if (req.advanced_math) need(req.advanced_math.id);

  req.core?.forEach((entry) => {
    if (isTechCorePickOne(entry)) {
      const matched = entry.options.some((o) => satisfied.has(o.id));
      if (!matched && entry.options[0]) need(entry.options[0].id);
    } else {
      need(entry.id);
    }
  });

  if (req.core_lab) {
    if (isTechCorePickOne(req.core_lab)) {
      const matched = req.core_lab.options.some((o) => satisfied.has(o.id));
      if (!matched && req.core_lab.options[0]) need(req.core_lab.options[0].id);
    } else {
      need(req.core_lab.id);
    }
  }

  if (req.required_elective) {
    need(req.required_elective.id);
  }

  // Tech-core electives — pick first N from the pool that user hasn't taken
  const electivesNeeded = techCore.elective_count?.general ?? 0;
  if (electivesNeeded > 0) {
    const candidates = techCore.elective_pool.filter((id) => !satisfied.has(id));
    candidates.slice(0, electivesNeeded).forEach(need);
  }

  // Gen-ed slots with concrete option lists
  for (const slot of degreeReqs.core_curriculum.slots) {
    const opts = slot.options;
    let resolvedOpts = opts;
    if (opts.includes('same_as_his1')) {
      const his1 = degreeReqs.core_curriculum.slots.find((s) => s.id === 'his1');
      if (his1) resolvedOpts = his1.options;
    }
    if (resolvedOpts.includes('list_of_approved')) {
      warnings.push(
        `Slot "${slot.label}" requires manual selection from approved list (${slot.hours} hrs).`
      );
      continue;
    }
    const enhanced = [...resolvedOpts];
    if (slot.id === 'vapa') enhanced.push('CTI 301G');
    if (slot.id === 'humanities') enhanced.push('CTI 302');

    if (enhanced.some((o) => satisfied.has(o))) continue;
    if (resolvedOpts[0]) need(resolvedOpts[0]);
  }

  // Math BA additional courses (if toggle on)
  if (mathBAToggle && mathReqs) {
    for (const item of mathReqs.math_ba.additional_courses_needed.breakdown) {
      if (item.example) need(item.example);
    }
  }

  // Free electives — note in warnings, do NOT auto-place
  if (degreeReqs.free_electives.total_hours > 0) {
    warnings.push(
      `${degreeReqs.free_electives.total_hours} hours of free electives are left for manual selection.`
    );
  }

  // Advanced tech elective — note, do not auto-place
  if (degreeReqs.advanced_tech_elective.count > 0) {
    warnings.push(
      `Advanced tech elective (${degreeReqs.advanced_tech_elective.count} course) is left for manual selection.`
    );
  }

  return { required: Array.from(required), warnings };
}

/**
 * Build the variant-expanded satisfied set from a user profile and the
 * past/current semesters of the plan. This is the shared setup that all
 * consumers of computeRemainingRequired must perform.
 */
export function buildSatisfiedSet(
  profile: UserProfile,
  degreeReqs: DegreeRequirements,
  semesters: Semester[] = [],
  plan: Plan = {}
): Set<string> {
  const satisfied = new Set<string>();
  for (const c of profile.completed_courses) addWithVariants(satisfied, c.course, degreeReqs);
  for (const c of profile.in_progress_courses) addWithVariants(satisfied, c.course, degreeReqs);
  for (const sem of semesters) {
    if (sem.status === 'past' || sem.status === 'current') {
      for (const c of plan[sem.id] ?? []) addWithVariants(satisfied, c, degreeReqs);
    }
  }
  return satisfied;
}

/**
 * Build the complete list of remaining required courses for a BSECE degree.
 *
 * Delegates to computeRemainingRequired with a full variant-expanded satisfied
 * set (including past/current plan semesters when provided).
 *
 * @param degreeReqs - degree-requirements.json
 * @param techCores - tech-cores.json
 * @param techCoreId - slug of the selected tech core track
 * @param mathBA - whether Math BA double major is enabled
 * @param mathReqs - math-requirements.json
 * @param profile - user-profile.json
 * @param semesters - full semester list (used to include past/current plan courses in satisfied)
 * @param plan - current plan state (used alongside semesters)
 * @returns flat array of course IDs still needed
 */
export function buildRemainingRequirements(
  degreeReqs: DegreeRequirements,
  techCores: TechCores,
  techCoreId: string,
  mathBA: boolean,
  mathReqs: MathRequirements | null,
  profile: UserProfile,
  semesters: Semester[] = [],
  plan: Plan = {}
): string[] {
  const track = techCores[techCoreId];
  if (!track) return [];

  const satisfied = buildSatisfiedSet(profile, degreeReqs, semesters, plan);
  const { required } = computeRemainingRequired(degreeReqs, track, mathReqs, mathBA, satisfied);
  return required;
}
