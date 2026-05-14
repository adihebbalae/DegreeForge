/**
 * graph-engine.ts
 *
 * Pure-TypeScript prerequisite graph engine (TASK-003).
 * No React imports, no side effects — safe to use in tests and non-browser environments.
 *
 * Edge direction convention in prerequisite-graph.json:
 *   { from: "M 408C", to: "ECE 302", type: "prerequisite" }
 *   → M 408C must be taken BEFORE ECE 302
 */

import type { PrereqGraphData, PrereqViolation } from '../types';

// ─── Public types ─────────────────────────────────────────────────────────────

export type { Plan, SemesterId, PlanState } from '../types';

// ─── PrereqGraph class ────────────────────────────────────────────────────────

/**
 * Wraps the raw prerequisite-graph.json data with typed graph traversal methods.
 * All methods handle unknown course IDs gracefully (return empty arrays, never throw).
 */
export class PrereqGraph {
  /** course → set of its direct prerequisites (must be taken BEFORE) */
  private readonly prereqsOf: Map<string, Set<string>> = new Map();
  /** course → set of its direct corequisites (must be taken same-or-earlier) */
  private readonly coreqsOf: Map<string, Set<string>> = new Map();
  /** course → set of courses that directly or transitively depend on it */
  private readonly directDependents: Map<string, Set<string>> = new Map();
  /** course → credit hours */
  private readonly creditsOf: Map<string, number> = new Map();

  constructor(graphData: PrereqGraphData) {
    // Initialize from nodes
    for (const [courseId, node] of Object.entries(graphData.nodes)) {
      this.creditsOf.set(courseId, node.credits);
      this._ensureEntry(courseId);
    }

    // Process edges — build prereq/coreq/dependent maps
    for (const edge of graphData.edges) {
      const { from, to, type } = edge;
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

  /** Credit hours for a course (defaults to 3 for courses not in the graph). */
  getCredits(courseId: string): number {
    return this.creditsOf.get(courseId) ?? 3;
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

  /**
   * Validate placing `courseId` at `semesterIndex` in the plan.
   * - Prerequisites must appear in semesters BEFORE `semesterIndex`
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

    const missingPrereqs = this.getPrereqs(courseId).filter((p) => !before.has(p));
    const unsatisfiedCoreqs = this.getCoreqs(courseId).filter((c) => !sameOrBefore.has(c));

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
