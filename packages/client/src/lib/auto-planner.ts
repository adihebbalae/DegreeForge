/**
 * auto-planner.ts
 *
 * Deterministic 4-year degree plan generator (TASK-018, was deferred TASK-004).
 *
 * Pure TypeScript — no React, no I/O, no side effects. Safe for tests and SSR.
 *
 * Strategy:
 *   1. Build the "satisfied set" from completed courses + in-progress + past/current plan,
 *      expanding each course to its variants (honors, legacy catalog number, transfer equivs)
 *      so prereq checks work regardless of which form the user has.
 *   2. Compute the remaining required courses for ECE core, math/physics sequence,
 *      tech-core, gen-ed slots (with concrete options), and optional Math BA additions.
 *   3. Topo-sort the required set respecting the prereq graph.
 *   4. Greedily fill future semesters earliest-first, honoring per-semester load cap,
 *      offering pattern, prereqs (in earlier semester), coreqs (same-or-earlier semester),
 *      and any pinned placements treated as fixed.
 *
 * The solver is intentionally conservative — courses without concrete option lists
 * (VAPA/SBS "list_of_approved", free electives, advanced tech elective) are left for
 * the user to fill in manually and surfaced in `warnings`.
 */

import { PrereqGraph } from './graph-engine';
import { isTechCorePickOne } from '../types';
import type {
  UserProfile,
  DegreeRequirements,
  TechCoreTrack,
  MathRequirements,
  Plan,
  Semester,
  CourseCatalog,
  PrereqNode,
} from '../types';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AutoPlannerInput {
  prereqGraph: PrereqGraph;
  /** Raw prereq graph nodes — used for offering pattern (fall/spring only). */
  prereqNodes?: Record<string, PrereqNode>;
  userProfile: UserProfile;
  degreeReqs: DegreeRequirements;
  techCore: TechCoreTrack;
  mathReqs: MathRequirements;
  mathBAToggle: boolean;
  semesters: Semester[];
  currentPlan: Plan;
  /** courseId -> semesterId. Pinned courses are placed first and not moved. */
  pinnedCourses?: Record<string, string>;
  catalog?: CourseCatalog;
  /** Override profile-derived load cap. */
  maxCoursesPerSemester?: number;
}

export interface AutoPlannerResult {
  plan: Plan;
  /** Required courses the solver couldn't fit anywhere. */
  unplacedCourses: string[];
  /** Single-line reason when unplacedCourses is non-empty. */
  reason?: string;
  /** Non-fatal notes the UI can surface (e.g. "free electives left for manual selection"). */
  warnings: string[];
}

// ─── Equivalency tables ───────────────────────────────────────────────────────

/** Legacy (pre-2026) -> canonical (2026-2028) catalog numbers. */
const LEGACY_TO_CANONICAL: Record<string, string> = {
  'ECE 302': 'ECE 402',
  'ECE 306': 'ECE 406',
  'ECE 312': 'ECE 412',
  'ECE 319K': 'ECE 419K',
};

/** Transfer-credit / dual-enrollment equivalents that satisfy UT courses. */
const TRANSFER_EQUIVALENTS: Record<string, string[]> = {
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
const COURSE_EQUIVALENTS: Record<string, string[]> = {
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
function expandVariants(
  courseId: string,
  degreeReqs: DegreeRequirements
): string[] {
  const out = new Set<string>([courseId]);
  const honors = degreeReqs.ece_core.honors_variants ?? {};

  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Array.from(out)) {
      // legacy -> canonical
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

function addWithVariants(
  set: Set<string>,
  courseId: string,
  degreeReqs: DegreeRequirements
): void {
  for (const v of expandVariants(courseId, degreeReqs)) set.add(v);
}

// ─── Required-course derivation ───────────────────────────────────────────────

/** Pick the first option from a pick-one TechCore group; works for either shape. */
function pickFirstOption(
  entry: { id: string } | { options: { id: string }[] }
): string | null {
  if ('id' in entry) return entry.id;
  if (entry.options && entry.options.length > 0) return entry.options[0].id;
  return null;
}

/**
 * Build the flat list of courses the user still needs to take.
 * Excludes anything already in the satisfied set.
 */
function computeRequiredCourses(
  degreeReqs: DegreeRequirements,
  techCore: TechCoreTrack,
  mathReqs: MathRequirements,
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

  // Physics sequence (skip lab corequisites if main course handles them in the graph;
  // place all four required courses — coreq logic ensures labs are placed alongside lectures)
  for (const id of degreeReqs.physics_sequence.required) need(id);

  // Tech-core required courses
  const req = techCore.required_courses;
  if (req.advanced_math) need(req.advanced_math.id);

  req.core?.forEach((entry) => {
    if (isTechCorePickOne(entry)) {
      // If user has any option, skip; else pick first
      const matched = entry.options.some((o) => satisfied.has(o.id));
      if (!matched && entry.options[0]) need(entry.options[0].id);
    } else {
      need(entry.id);
    }
  });

  if (req.core_lab) {
    const pick = pickFirstOption(req.core_lab as any);
    if (pick) {
      // If user has any of the options, skip
      if ('options' in req.core_lab) {
        const matched = (req.core_lab as any).options.some((o: { id: string }) =>
          satisfied.has(o.id)
        );
        if (!matched) need(pick);
      } else {
        need(pick);
      }
    }
  }

  if (req.required_elective) {
    if ('options' in (req.required_elective as any)) {
      const re = req.required_elective as any;
      const matched = re.options.some((o: { id: string }) => satisfied.has(o.id));
      if (!matched && re.options[0]) need(re.options[0].id);
    } else {
      need((req.required_elective as { id: string }).id);
    }
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
    // Resolve "same_as_his1"
    let resolvedOpts = opts;
    if (opts.includes('same_as_his1')) {
      const his1 = degreeReqs.core_curriculum.slots.find((s) => s.id === 'his1');
      if (his1) resolvedOpts = his1.options;
    }
    // Skip placeholder slots — surface in warnings
    if (resolvedOpts.includes('list_of_approved')) {
      warnings.push(
        `Slot "${slot.label}" requires manual selection from approved list (${slot.hours} hrs).`
      );
      continue;
    }
    // CTI substitutions per progress.ts convention
    const enhanced = [...resolvedOpts];
    if (slot.id === 'vapa') enhanced.push('CTI 301G');
    if (slot.id === 'humanities') enhanced.push('CTI 302');

    if (enhanced.some((o) => satisfied.has(o))) continue;
    if (resolvedOpts[0]) need(resolvedOpts[0]);
  }

  // Math BA additional courses (if toggle on)
  if (mathBAToggle) {
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

// ─── Load-cap derivation ──────────────────────────────────────────────────────

function getLoadCap(profile: UserProfile, override?: number): number {
  if (typeof override === 'number' && override > 0) return override;
  const tol = profile.preferences?.course_load_tolerance;
  if (tol === 'above_average') return 5;
  if (tol === 'below_average') return 3;
  return 4; // average / unspecified
}

// ─── Offering check ───────────────────────────────────────────────────────────

/**
 * Returns true if the course is offered during the given season.
 * Defaults to true when offering data is unknown (better to over-place than block).
 */
function isOfferedInSeason(
  courseId: string,
  season: Semester['season'],
  prereqNodes?: Record<string, PrereqNode>
): boolean {
  if (!prereqNodes) return true;
  const node = prereqNodes[courseId];
  const offered = node?.offered;
  if (!offered || offered.length === 0) return true;
  return offered.includes(season.toLowerCase());
}

// ─── Prereq / coreq satisfied-relative-to-semester checks ─────────────────────

function isInPriorSemester(
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

function isInSameOrPriorSemester(
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

// ─── Main entry point ─────────────────────────────────────────────────────────

export function generateAutoPlan(input: AutoPlannerInput): AutoPlannerResult {
  const {
    prereqGraph,
    prereqNodes,
    userProfile,
    degreeReqs,
    techCore,
    mathReqs,
    mathBAToggle,
    semesters,
    currentPlan,
    pinnedCourses = {},
    maxCoursesPerSemester,
  } = input;

  const variants = (id: string) => expandVariants(id, degreeReqs);

  // ── 1. Initialize the result plan: copy past + current, blank future ──────
  const resultPlan: Plan = {};
  const futureSemesters = semesters.filter((s) => s.status === 'future');
  for (const sem of semesters) {
    if (sem.status === 'past' || sem.status === 'current') {
      resultPlan[sem.id] = [...(currentPlan[sem.id] ?? [])];
    } else {
      resultPlan[sem.id] = [];
    }
  }

  // ── 2. Build the IMMUTABLE pre-plan satisfied set (with variants) ─────────
  // This represents courses already done BEFORE any future placement. The plan
  // we generate also contributes to "satisfied for downstream prereq checks"
  // but via isInPriorSemester(...) — NOT by adding to this set. Otherwise we'd
  // incorrectly consider a same-semester placement to satisfy a prereq.
  const satisfied = new Set<string>();
  for (const c of userProfile.completed_courses) addWithVariants(satisfied, c.course, degreeReqs);
  for (const c of userProfile.in_progress_courses) addWithVariants(satisfied, c.course, degreeReqs);
  for (const sem of semesters) {
    if (sem.status === 'past' || sem.status === 'current') {
      for (const c of resultPlan[sem.id]) addWithVariants(satisfied, c, degreeReqs);
    }
  }

  // ── 3. Place pinned courses first (they're fixed constraints) ─────────────
  for (const [courseId, semesterId] of Object.entries(pinnedCourses)) {
    if (!resultPlan[semesterId]) continue;
    if (!resultPlan[semesterId].includes(courseId)) {
      resultPlan[semesterId].push(courseId);
    }
    // Intentionally do NOT add to satisfied — pinned courses live in the plan,
    // so isInPriorSemester finds them when checking downstream prereqs.
  }

  // ── 4. Compute remaining required courses ─────────────────────────────────
  const { required, warnings } = computeRequiredCourses(
    degreeReqs,
    techCore,
    mathReqs,
    mathBAToggle,
    satisfied
  );

  // ── 5. Topo-sort the required courses (deterministic) ─────────────────────
  const orderedRequired = prereqGraph.topologicalSort(required);

  // ── 6. Greedy fill: for each course, find the earliest valid semester ─────
  const loadCap = getLoadCap(userProfile, maxCoursesPerSemester);
  const unplaced: string[] = [];
  const semesterOrderIds = semesters.map((s) => s.id);

  // Snapshot already-placed courses (pinned + past + current) so we don't try to re-place them.
  const alreadyInPlan = new Set<string>();
  for (const sem of semesters) {
    for (const c of resultPlan[sem.id] ?? []) alreadyInPlan.add(c);
  }

  for (const courseId of orderedRequired) {
    if (alreadyInPlan.has(courseId)) continue;
    if (satisfied.has(courseId)) continue;

    let placed = false;
    for (const sem of futureSemesters) {
      const semIdx = semesterOrderIds.indexOf(sem.id);

      // Capacity check
      if (resultPlan[sem.id].length >= loadCap) continue;
      // Offering check
      if (!isOfferedInSeason(courseId, sem.season, prereqNodes)) continue;
      // Prereq check (must be in strictly earlier semester or in satisfied set)
      const prereqs = prereqGraph.getPrereqs(courseId);
      const prereqsOk = prereqs.every(
        (p) =>
          satisfied.has(p) ||
          isInPriorSemester(p, semIdx, semesters, resultPlan, variants)
      );
      if (!prereqsOk) continue;
      // Coreq check (must be in same or earlier semester, or satisfied)
      const coreqs = prereqGraph.getCoreqs(courseId);
      const coreqsOk = coreqs.every(
        (c) =>
          satisfied.has(c) ||
          isInSameOrPriorSemester(c, semIdx, semesters, resultPlan, variants)
      );
      if (!coreqsOk) continue;

      // Place it. Do NOT add to satisfied — downstream prereq checks find
      // this placement via isInPriorSemester, which correctly enforces the
      // "must be in a STRICTLY EARLIER semester" rule.
      resultPlan[sem.id].push(courseId);
      placed = true;
      break;
    }

    if (!placed) unplaced.push(courseId);
  }

  // ── 7. Diagnostics ────────────────────────────────────────────────────────
  const reason =
    unplaced.length > 0
      ? `Could not fit ${unplaced.length} course${unplaced.length === 1 ? '' : 's'} ` +
        `within the remaining ${futureSemesters.length} semesters at ${loadCap} courses/semester. ` +
        `Try increasing load tolerance or extending graduation timeline.`
      : undefined;

  return { plan: resultPlan, unplacedCourses: unplaced, reason, warnings };
}
