/**
 * diagnostics.ts — TASK-043: "Best Path" diagnostics
 *
 * Deterministic, pure-TypeScript diagnostics for the student's current plan.
 * No React, no I/O, no network calls. Safe for unit tests and non-browser environments.
 *
 * Three diagnostics:
 *   1. Critical path  — longest prerequisite chain of remaining required courses
 *      that determines the earliest possible graduation term.
 *   2. Per-semester slack — spare credit capacity per future semester (cap − placed hours).
 *   3. Bottleneck flags — term-locked and/or zero-slack courses where slipping them
 *      pushes graduation back a term, each with a one-line "why it matters" + delay cost.
 *
 * v0 assumption: a single current catalog year is hard-coded.
 * Catalog-year as a solver input is deferred to TASK-048.
 */

import type { Plan, Semester, OfferingSchedule } from '../types';
import { PrereqGraph } from './graph-engine';
import { canOfferInSemester } from './solver';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface DiagnosticsInput {
  /** Remaining required course IDs (from computeRequiredCourses). */
  remainingRequired: string[];
  /** The student's current plan (semesterId → courseId[]). */
  plan: Plan;
  /** Full semester list (past, current, future). */
  semesters: Semester[];
  /** PrereqGraph instance. */
  prereqGraph: PrereqGraph;
  /** Offering schedule from offering-schedule.json. */
  offeringSchedule: OfferingSchedule;
  /** Per-semester credit-hour cap (from getCreditHourCap). */
  creditHourCap: number;
}

/** One link in the critical path chain. */
export interface CriticalPathCourse {
  courseId: string;
  /** The semester this course appears in (null if not yet placed). */
  semesterId: string | null;
  /** Depth of this node in the longest chain (0 = earliest). */
  depth: number;
  /** True when this is the last course in the chain (the graduation bottleneck). */
  isTail?: boolean;
}

export interface CriticalPathResult {
  /** The ordered chain of courses from start to end (earliest first). */
  chain: CriticalPathCourse[];
  /** Total depth (number of courses in the chain). */
  length: number;
  /**
   * Semester ID of the latest-placed course among all tied deepest-depth courses,
   * i.e. the earliest possible graduation term under the current plan.
   */
  bottleneckSemesterId: string | null;
}

export interface SemesterSlack {
  semesterId: string;
  /** Credits currently placed in this semester. */
  placedHours: number;
  /** The per-semester credit-hour cap. */
  cap: number;
  /** Spare credits (cap − placedHours). Negative means over-cap. */
  spare: number;
  /** Human-readable label, e.g. "3 hrs spare" or "full". */
  label: string;
}

export interface BottleneckFlag {
  courseId: string;
  /** The semester where this course is currently placed. */
  semesterId: string | null;
  /** True if the course can only be offered in one specific season. */
  isTermLocked: boolean;
  /** Number of future semesters this course can legally move to without chain impact. */
  slack: number;
  /** One-line plain-English explanation of why this course matters. */
  whyItMatters: string;
  /** Human-readable graduation delay if this course slips one valid offering. */
  delayCost: string;
}

export interface DiagnosticsResult {
  criticalPath: CriticalPathResult;
  semesterSlack: SemesterSlack[];
  bottlenecks: BottleneckFlag[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Sum credit hours for a list of course IDs. */
function sumCredits(courseIds: string[], prereqGraph: PrereqGraph): number {
  return courseIds.reduce((sum, id) => sum + prereqGraph.getCredits(id), 0);
}

/**
 * Build a reverse-lookup: semesterId → index in the semesters array.
 * O(n) pre-computation; used for ordering checks.
 */
function buildSemesterIndex(semesters: Semester[]): Map<string, number> {
  const idx = new Map<string, number>();
  for (let i = 0; i < semesters.length; i++) {
    idx.set(semesters[i].id, i);
  }
  return idx;
}

/**
 * Find the semester ID in the plan where a course is placed.
 * Returns null if the course is not in the plan.
 */
function semesterOf(courseId: string, plan: Plan): string | null {
  for (const [semId, courses] of Object.entries(plan)) {
    if (courses.includes(courseId)) return semId;
  }
  return null;
}

// ─── 1. Critical path ─────────────────────────────────────────────────────────

/**
 * Compute the critical (longest prerequisite) path through the remaining
 * required courses.
 *
 * Algorithm: DAG longest-path via memoized DFS.
 *   For each course, longest_path(c) = 1 + max(longest_path(p)) over all prereqs p
 *   that are themselves in remainingRequired (i.e. not yet satisfied).
 *
 * Edge convention: getPrereqs(c) returns courses that must be taken BEFORE c.
 */
export function computeCriticalPath(
  remainingRequired: string[],
  plan: Plan,
  prereqGraph: PrereqGraph,
  semesters: Semester[]
): CriticalPathResult {
  const requiredSet = new Set(remainingRequired);
  const semIdx = buildSemesterIndex(semesters);

  // Memoize longest chain depth for each course
  const memo = new Map<string, number>();
  // On-stack guard: if we encounter a course already on the DFS stack, a cycle
  // exists. Return 0 to break it safely (treats the back-edge as a no-op).
  const visiting = new Set<string>();

  function depth(courseId: string): number {
    if (memo.has(courseId)) return memo.get(courseId)!;
    if (visiting.has(courseId)) return 0; // cycle guard — break the back-edge
    visiting.add(courseId);
    const prereqs = prereqGraph.getPrereqs(courseId).filter((p) => requiredSet.has(p));
    const d = prereqs.length === 0 ? 0 : Math.max(...prereqs.map(depth)) + 1;
    visiting.delete(courseId);
    memo.set(courseId, d);
    return d;
  }

  // Compute depth for all remaining required courses
  for (const c of remainingRequired) depth(c);

  // Find the course with the maximum depth (tail of the critical path)
  let maxDepth = -1;
  let tail: string | null = null;
  for (const c of remainingRequired) {
    const d = memo.get(c) ?? 0;
    if (d > maxDepth) {
      maxDepth = d;
      tail = c;
    }
  }

  if (!tail) {
    return { chain: [], length: 0, bottleneckSemesterId: null };
  }

  // Reconstruct the chain by following the longest prereq at each step.
  // The visited set guards against infinite loops when the graph has cycles
  // (same protection as the `visiting` guard in depth()).
  const chainVisited = new Set<string>([tail]);
  const chain: string[] = [tail];
  let current = tail;
  while (true) {
    const prereqs = prereqGraph
      .getPrereqs(current)
      .filter((p) => requiredSet.has(p) && !chainVisited.has(p));
    if (prereqs.length === 0) break;
    // Pick the prereq with the maximum depth to follow the critical path
    const next = prereqs.reduce((best, p) =>
      (memo.get(p) ?? 0) > (memo.get(best) ?? 0) ? p : best
    );
    chainVisited.add(next);
    chain.push(next);
    current = next;
  }
  chain.reverse(); // earliest course first

  // Build result with semester placements
  const chainCourses: CriticalPathCourse[] = chain.map((id, i) => ({
    courseId: id,
    semesterId: semesterOf(id, plan),
    depth: i,
  }));

  // bottleneckSemesterId: among all remaining required courses at the maximum depth
  // (ties possible), pick the one placed latest in the plan. This gives the
  // earliest possible graduation term under the current placement.
  const deepestCourses = remainingRequired.filter((c) => (memo.get(c) ?? 0) === maxDepth);
  let latestIdx = -1;
  let latestSemId: string | null = null;
  for (const c of deepestCourses) {
    const semId = semesterOf(c, plan);
    if (semId) {
      const idx = semIdx.get(semId) ?? -1;
      if (idx > latestIdx) {
        latestIdx = idx;
        latestSemId = semId;
      }
    }
  }
  const bottleneckSemesterId = latestSemId;

  return { chain: chainCourses, length: chainCourses.length, bottleneckSemesterId };
}

// ─── 2. Per-semester slack ────────────────────────────────────────────────────

/**
 * Compute the credit-hour slack for each future semester.
 * Slack = creditHourCap − sum(credits of placed courses).
 */
export function computeSemesterSlack(
  plan: Plan,
  semesters: Semester[],
  prereqGraph: PrereqGraph,
  creditHourCap: number
): SemesterSlack[] {
  return semesters
    .filter((s) => s.status === 'future')
    .map((s) => {
      const courses = plan[s.id] ?? [];
      const placedHours = sumCredits(courses, prereqGraph);
      const spare = creditHourCap - placedHours;

      let label: string;
      if (spare <= 0) {
        label = 'full';
      } else {
        label = `${spare} hr${spare === 1 ? '' : 's'} spare`;
      }

      return { semesterId: s.id, placedHours, cap: creditHourCap, spare, label };
    });
}

// ─── 3. Bottleneck flags ──────────────────────────────────────────────────────

/**
 * Identify bottleneck courses in the remaining required set — specifically courses
 * where slipping them pushes graduation back a term.
 *
 * Two categories of bottleneck are flagged:
 *
 *   (A) Term-locked courses with downstream dependents in the remaining set.
 *       These can only be taken in one season, so missing their offering ripples
 *       to everything that depends on them.
 *       Slack = how many valid future offerings remain AFTER the current placement.
 *
 *   (B) The tail course of the critical path (the last course in the longest
 *       prereq chain). Moving it even one slot pushes the graduation term back
 *       because it determines the earliest possible graduation date.
 *       This is flagged even when the course is offered both fall and spring,
 *       because it sits at the end of the longest dependency chain.
 *
 * A course can satisfy both (A) and (B) simultaneously.
 *
 * @param criticalPathTail - the courseId at the end of the critical path chain
 *   (from computeCriticalPath). Pass null when no critical path exists.
 */
export function computeBottlenecks(
  remainingRequired: string[],
  plan: Plan,
  semesters: Semester[],
  prereqGraph: PrereqGraph,
  offeringSchedule: OfferingSchedule,
  criticalPathTail: string | null = null
): BottleneckFlag[] {
  const requiredSet = new Set(remainingRequired);
  const futureSemesters = semesters.filter((s) => s.status === 'future');

  const flags: BottleneckFlag[] = [];
  const flaggedCourses = new Set<string>();

  // ── Helper: compute offering slack for a course ──────────────────────────────
  function computeSlack(courseId: string): number {
    const validSemesters = futureSemesters.filter((s) =>
      canOfferInSemester(courseId, s, offeringSchedule)
    );

    const currentSemId = semesterOf(courseId, plan);
    if (!currentSemId) {
      // Unplaced: slack = valid future semesters minus 1
      return Math.max(0, validSemesters.length - 1);
    }

    const currentIdx = futureSemesters.findIndex((s) => s.id === currentSemId);
    if (currentIdx === -1) {
      // Placed in past/current — no future slack needed
      return Infinity;
    }

    // Semesters after the current placement where it could be offered
    return validSemesters.filter((s) => {
      const idx = futureSemesters.findIndex((f) => f.id === s.id);
      return idx > currentIdx;
    }).length;
  }

  // ── (A) Term-locked courses with downstream dependents ────────────────────────
  for (const courseId of remainingRequired) {
    const entry = offeringSchedule[courseId];
    const offeredSemesters = entry?.offered_semesters ?? [];

    const isTermLocked =
      offeredSemesters.length === 1 &&
      (offeredSemesters[0] === 'fall' || offeredSemesters[0] === 'spring');

    if (!isTermLocked) continue;

    // Count downstream required courses (courses that depend on this one)
    const downstream = prereqGraph.getDownstream(courseId).filter((d) => requiredSet.has(d));
    if (downstream.length === 0) continue;

    const currentSemId = semesterOf(courseId, plan);

    // Skip if placed in a non-future semester
    if (currentSemId) {
      const isFutureSem = futureSemesters.some((s) => s.id === currentSemId);
      if (!isFutureSem) continue;
    }

    const slack = computeSlack(courseId);
    if (slack === Infinity) continue; // Past/current — skip

    const lockedSeason = offeredSemesters[0] as 'fall' | 'spring';
    const seasonLabel = lockedSeason.charAt(0).toUpperCase() + lockedSeason.slice(1);

    const whyItMatters =
      `${courseId} — ${seasonLabel}-only; ${downstream.length} downstream course${downstream.length === 1 ? '' : 's'} depend${downstream.length === 1 ? 's' : ''} on it`;

    const delayCost =
      slack === 0
        ? `${courseId} — 0 semesters of slack; slip it and you graduate a term later`
        : `${courseId} — ${slack} slot${slack === 1 ? '' : 's'} of slack (${seasonLabel}-only)`;

    flags.push({
      courseId,
      semesterId: currentSemId,
      isTermLocked: true,
      slack,
      whyItMatters,
      delayCost,
    });
    flaggedCourses.add(courseId);
  }

  // ── (B) Critical path tail — always flagged if placed in a future semester ────
  if (criticalPathTail && !flaggedCourses.has(criticalPathTail)) {
    const currentSemId = semesterOf(criticalPathTail, plan);

    // Only flag if in a future semester (not past/current which can't be slipped)
    const isFutureSem = currentSemId
      ? futureSemesters.some((s) => s.id === currentSemId)
      : true; // unplaced → still a future concern

    if (isFutureSem) {
      const slack = computeSlack(criticalPathTail);
      if (slack !== Infinity) {
        const entry = offeringSchedule[criticalPathTail];
        const offeredSemesters = entry?.offered_semesters ?? [];
        const isTermLocked =
          offeredSemesters.length === 1 &&
          (offeredSemesters[0] === 'fall' || offeredSemesters[0] === 'spring');

        const isUnplaced = currentSemId === null;
        const effectiveSlack = isUnplaced ? 0 : slack;

        const whyItMatters =
          `${criticalPathTail} — end of the longest prereq chain; graduation can't happen until after this course`;

        const delayCost = isUnplaced
          ? `${criticalPathTail} — GRADUATION-BLOCKING: not yet placed; must be scheduled to graduate`
          : effectiveSlack === 0
            ? `${criticalPathTail} — 0 semesters of slack; slip it and you graduate a term later`
            : `${criticalPathTail} — ${effectiveSlack} slot${effectiveSlack === 1 ? '' : 's'} of slack (graduation gate)`;

        flags.push({
          courseId: criticalPathTail,
          semesterId: currentSemId,
          isTermLocked,
          slack: effectiveSlack,
          whyItMatters,
          delayCost,
        });
      }
    }
  }

  // Sort: zero-slack first, then by course ID for determinism
  flags.sort((a, b) => {
    if (a.slack !== b.slack) return a.slack - b.slack;
    return a.courseId.localeCompare(b.courseId);
  });

  return flags;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Compute all three diagnostics in one call.
 * Returns a DiagnosticsResult that is safe to memoize (same inputs → same output).
 */
export function computeDiagnostics(input: DiagnosticsInput): DiagnosticsResult {
  const { remainingRequired, plan, semesters, prereqGraph, offeringSchedule, creditHourCap } = input;

  const criticalPath = computeCriticalPath(remainingRequired, plan, prereqGraph, semesters);
  const semesterSlack = computeSemesterSlack(plan, semesters, prereqGraph, creditHourCap);

  // The tail of the critical path is the graduation bottleneck
  const criticalPathTail =
    criticalPath.chain.length > 0
      ? criticalPath.chain[criticalPath.chain.length - 1].courseId
      : null;

  const bottlenecks = computeBottlenecks(
    remainingRequired,
    plan,
    semesters,
    prereqGraph,
    offeringSchedule,
    criticalPathTail
  );

  return { criticalPath, semesterSlack, bottlenecks };
}
