/**
 * graph-engine.ts  — TASK-057
 *
 * Pure-TypeScript prerequisite graph engine.
 * No React imports, no side effects — safe to use in tests and non-browser environments.
 *
 * Edge direction convention in prerequisite-graph.json:
 *   { from: "M 408C", to: "ECE 302", type: "prerequisite" }
 *   → M 408C must be taken BEFORE ECE 302
 *
 * OR-group (CNF) evaluation — TASK-057:
 *   A course's prereqs are evaluated as a conjunction of disjunctions:
 *     all_of: [ { one_of: [...courseIds] }, ... ]
 *   A group is satisfied if ANY member is satisfied (after equivalence expansion).
 *   The course is satisfied iff EVERY group is satisfied.
 *
 *   Default for ungrouped courses: the flat prereq edges are treated as a SINGLE
 *   one_of group (satisfied if ANY edge is met). This flips the broken AND default
 *   and is correct for the OR-pool majority (honors/cross-list variants).
 *   Genuine AND-stacks (ECE 411, ECE 313, etc.) are authored explicitly in
 *   prereq-cnf.ts so they remain strictly validated.
 */

import type { PrereqGraphData, PrereqCNF, PrereqGroup, PrereqViolation } from '../types';
import { isRequirementSatisfied } from './requirements';
import { PREREQ_CNF } from './prereq-cnf';

// ─── Public types ─────────────────────────────────────────────────────────────

export type { Plan, SemesterId, PlanState } from '../types';

// ─── PrereqGraph class ────────────────────────────────────────────────────────

/**
 * Wraps the raw prerequisite-graph.json data with typed graph traversal methods.
 * All methods handle unknown course IDs gracefully (return empty arrays, never throw).
 */
export class PrereqGraph {
  /** course → set of its direct prerequisites (must be taken BEFORE). Self-edges excluded. */
  private readonly prereqsOf: Map<string, Set<string>> = new Map();
  /** course → set of its direct corequisites (must be taken same-or-earlier) */
  private readonly coreqsOf: Map<string, Set<string>> = new Map();
  /** course → set of courses that directly or transitively depend on it */
  private readonly directDependents: Map<string, Set<string>> = new Map();
  /**
   * CNF prereq override map. Defaults to the authored PREREQ_CNF (production).
   * Pass an empty object `{}` in tests to use pure flat-edge AND-semantics
   * (the old behavior), or pass custom CNF for test-specific scenarios.
   */
  private readonly cnf: PrereqCNF;

  constructor(graphData: PrereqGraphData, cnfOverride?: PrereqCNF) {
    this.cnf = cnfOverride !== undefined ? cnfOverride : PREREQ_CNF;
    // Initialize from nodes
    for (const courseId of Object.keys(graphData.nodes)) {
      this._ensureEntry(courseId);
    }

    // Process edges — build prereq/coreq/dependent maps.
    // Self-edges (from === to) are dropped — they are data-quality artifacts
    // from freetext parsing of graduate course listings.
    for (const edge of graphData.edges) {
      const { from, to, type } = edge;
      // Drop self-edges
      if (from === to) continue;

      this._ensureEntry(from);
      this._ensureEntry(to);

      if (type === 'prerequisite') {
        this.prereqsOf.get(to)!.add(from);
        this.directDependents.get(from)!.add(to);
      } else if (type === 'corequisite') {
        this.coreqsOf.get(to)!.add(from);
        // Coreqs also create a dependency relationship for downstream traversal
        this.directDependents.get(from)!.add(to);
      }
    }
  }

  // ─── Graph queries ────────────────────────────────────────────────────────

  /** Direct prerequisites of `courseId` (courses that must be taken BEFORE). */
  getPrereqs(courseId: string): string[] {
    return Array.from(this.prereqsOf.get(courseId) ?? []);
  }

  /** Direct corequisites of `courseId` (courses that must be taken same-or-earlier). */
  getCoreqs(courseId: string): string[] {
    return Array.from(this.coreqsOf.get(courseId) ?? []);
  }

  /**
   * All courses that directly or transitively depend on `courseId`.
   * "If I remove ECE 302, what breaks?"
   * BFS over directDependents.
   */
  getDownstream(courseId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [courseId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = this.directDependents.get(current);
      if (deps) {
        for (const dep of deps) {
          if (!visited.has(dep)) {
            visited.add(dep);
            queue.push(dep);
          }
        }
      }
    }
    return Array.from(visited);
  }

  /**
   * All courses that `courseId` transitively depends on (all prereqs, recursively).
   * "What do I need before I can take ECE 460N?"
   * BFS over prereqsOf.
   */
  getAllPrereqs(courseId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [...(this.prereqsOf.get(courseId) ?? [])];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (!visited.has(current)) {
        visited.add(current);
        const prereqs = this.prereqsOf.get(current);
        if (prereqs) {
          for (const p of prereqs) {
            if (!visited.has(p)) queue.push(p);
          }
        }
      }
    }
    return Array.from(visited);
  }

  /**
   * Topological sort of the given course list using Kahn's algorithm.
   * Both prerequisites AND corequisites count as ordering edges (so coreqs come first).
   * Handles cycles gracefully by appending remaining nodes at the end.
   * Output is deterministic (alphabetical tiebreaking).
   */
  topologicalSort(courseIds: string[]): string[] {
    const courseSet = new Set(courseIds);
    // Use a Set<string> per node to prevent double-counting duplicate edges
    const adj = new Map<string, Set<string>>(); // dep → dependents (within courseSet)
    const inDegree = new Map<string, number>();

    for (const id of courseIds) {
      adj.set(id, new Set());
      inDegree.set(id, 0);
    }

    for (const id of courseIds) {
      // Both prereqs and coreqs impose ordering constraints
      const prereqs = this.prereqsOf.get(id) ?? new Set<string>();
      const coreqs = this.coreqsOf.get(id) ?? new Set<string>();
      const allDeps = new Set<string>([...prereqs, ...coreqs]);

      for (const dep of allDeps) {
        if (courseSet.has(dep) && dep !== id) {
          // dep must come before id
          if (!adj.get(dep)!.has(id)) {
            adj.get(dep)!.add(id);
            inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
          }
        }
      }
    }

    // Seed queue with zero-in-degree nodes, sorted for determinism
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }
    queue.sort();

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = Array.from(adj.get(current) ?? []).sort();
      for (const nbr of neighbors) {
        const newDeg = (inDegree.get(nbr) ?? 0) - 1;
        inDegree.set(nbr, newDeg);
        if (newDeg === 0) {
          // Insert in sorted position for determinism
          const insertAt = queue.findIndex((q) => q > nbr);
          if (insertAt === -1) queue.push(nbr);
          else queue.splice(insertAt, 0, nbr);
        }
      }
    }

    // Append any remaining courses (cycles or disconnected nodes)
    for (const id of courseIds) {
      if (!result.includes(id)) result.push(id);
    }

    return result;
  }

  // ─── OR-group (CNF) evaluation ────────────────────────────────────────────

  /**
   * Get the CNF prereq groups for a course.
   *
   * If the course has explicit CNF in PREREQ_CNF, return those groups.
   * Otherwise, derive a default: wrap the flat prereq edge list into a SINGLE
   * one_of group (default-OR: satisfied if ANY prereq is met).
   * Single-edge courses produce a one-member group (still required).
   * Courses with no prereq edges return [].
   */
  getPrereqGroups(courseId: string): PrereqGroup[] {
    const explicit = this.cnf[courseId];
    if (explicit !== undefined) return explicit;

    const flatPrereqs = this.getPrereqs(courseId);
    if (flatPrereqs.length === 0) return [];

    // Default: single OR-group across all flat prereqs
    return [{ one_of: flatPrereqs }];
  }

  /**
   * Evaluate whether all CNF prereq groups for `courseId` are satisfied
   * given the set of courses available before the target semester.
   *
   * Returns an array of unsatisfied groups (empty = all satisfied).
   */
  getUnsatisfiedPrereqGroups(courseId: string, before: Set<string>): PrereqGroup[] {
    const groups = this.getPrereqGroups(courseId);
    return groups.filter((group) => !_isGroupSatisfied(group, before));
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Validate placing `courseId` at `semesterIndex` in the plan.
   * - Prerequisites (CNF groups) must ALL be satisfied by courses in semesters BEFORE `semesterIndex`
   * - Corequisites must appear in the SAME or earlier semester
   * Returns an empty array for valid placements.
   */
  validatePlacement(
    courseId: string,
    semesterIndex: number,
    plan: import('../types').Plan,
    semesterOrder: string[],
    completedSet?: Set<string>
  ): PrereqViolation[] {
    // Courses available before the target semester
    const before = new Set<string>(completedSet || []);
    for (let i = 0; i < semesterIndex; i++) {
      for (const c of plan[semesterOrder[i]] ?? []) before.add(c);
    }
    // Courses in the target semester (for coreq check)
    const inSemester = new Set<string>(plan[semesterOrder[semesterIndex]] ?? []);
    const sameOrBefore = new Set<string>([...before, ...inSemester]);

    // CNF-based prereq evaluation (OR-group logic)
    const unsatisfiedGroups = this.getUnsatisfiedPrereqGroups(courseId, before);
    const missingPrereqs = _flattenUnsatisfiedGroups(unsatisfiedGroups);

    const unsatisfiedCoreqs = this.getCoreqs(courseId).filter((c) => !isRequirementSatisfied(c, sameOrBefore));

    if (missingPrereqs.length === 0 && unsatisfiedCoreqs.length === 0) return [];

    const violationType: 'prereq' | 'coreq' | 'both' =
      missingPrereqs.length > 0 && unsatisfiedCoreqs.length > 0
        ? 'both'
        : missingPrereqs.length > 0
          ? 'prereq'
          : 'coreq';

    return [
      {
        courseId,
        semesterId: semesterOrder[semesterIndex] ?? 'unknown',
        missingPrereqs,
        unsatisfiedCoreqs,
        violationType,
      },
    ];
  }

  /**
   * Validate all course placements in a full plan.
   * Returns all violations (empty array = plan is valid).
   */
  validatePlan(
    plan: import('../types').Plan,
    semesterOrder: string[],
    completedSet?: Set<string>
  ): PrereqViolation[] {
    const violations: PrereqViolation[] = [];
    for (let i = 0; i < semesterOrder.length; i++) {
      for (const courseId of plan[semesterOrder[i]] ?? []) {
        violations.push(...this.validatePlacement(courseId, i, plan, semesterOrder, completedSet));
      }
    }
    return violations;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _ensureEntry(courseId: string): void {
    if (!this.prereqsOf.has(courseId)) this.prereqsOf.set(courseId, new Set());
    if (!this.coreqsOf.has(courseId)) this.coreqsOf.set(courseId, new Set());
    if (!this.directDependents.has(courseId)) this.directDependents.set(courseId, new Set());
  }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

/**
 * Return true if the group is satisfied: at least one member is satisfied
 * (via isRequirementSatisfied which handles equivalences).
 */
function _isGroupSatisfied(group: PrereqGroup, before: Set<string>): boolean {
  return group.one_of.some((member) => isRequirementSatisfied(member, before));
}

/**
 * For display in violation tooltips, flatten the list of unsatisfied groups
 * into a flat array of representative course IDs.
 * Each group contributes its first member as the representative missing req.
 * If there's only one group and it has multiple members, we note "any of [...]".
 */
function _flattenUnsatisfiedGroups(groups: PrereqGroup[]): string[] {
  if (groups.length === 0) return [];
  const missing: string[] = [];
  for (const group of groups) {
    if (group.one_of.length === 1) {
      missing.push(group.one_of[0]);
    } else {
      // Multi-member OR group: include all members for tooltip display
      // so the user sees the full set of options to choose from
      missing.push(...group.one_of);
    }
  }
  return missing;
}
