import type { PlanState, Semester, WhatIfState } from '../types';
import { sanitizePlan, isValidCourseId, isPastSemester } from '../lib/sanitize-course-list';
import { parsePlanState } from '../lib/plan-schema';

// ─── Action Types ─────────────────────────────────────────────────────────────

export type PlanAction =
  | { type: 'ADD_COURSE'; semesterId: string; courseId: string }
  | { type: 'REMOVE_COURSE'; semesterId: string; courseId: string }
  | { type: 'MOVE_COURSE'; fromSemesterId: string; toSemesterId: string; courseId: string }
  | { type: 'REORDER_SEMESTER'; semesterId: string; courseIds: string[] }
  | { type: 'SET_PLAN'; plan: Record<string, string[]> }
  | { type: 'PIN_COURSE'; courseId: string }
  | { type: 'UNPIN_COURSE'; courseId: string }
  | { type: 'SET_HOVERED_COURSE'; courseId: string | null }
  | { type: 'SET_TECH_CORE'; techCoreId: string }
  | { type: 'TOGGLE_MATH_BA'; enabled: boolean }
  /**
   * Seed the whatIf staged values from the current Settings baseline without
   * marking the simulation as active.  Dispatched by WhatIfPanel on open so
   * the dropdowns always start from the persisted Settings values, not from
   * a stale whatIf.techCoreId that pre-dates the last Settings change.
   */
  | { type: 'SEED_WHAT_IF'; techCoreId: string; mathBAToggle: boolean }
  | { type: 'APPLY_WHAT_IF'; newPlan: Record<string, string[]> }
  | { type: 'RESET_WHAT_IF' }
  | { type: 'RESET_PLAN' }
  | { type: 'SET_FULL_STATE'; state: PlanState }
  | { type: 'ADVANCE_SEMESTER'; grades: Record<string, string> }
  | { type: 'SET_GHOST_COURSES'; ghostCourses: Record<string, string[]> }
  | { type: 'ACCEPT_GHOST'; courseId: string; semesterId: string }
  | { type: 'DISMISS_GHOSTS' }
  | { type: 'REJECT_GHOST'; courseId: string }
  | { type: 'SET_FOCUSED_GHOST'; courseId: string | null }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_PROFILE_META'; major?: string; catalogYear?: string };

// ─── Context Shape ────────────────────────────────────────────────────────────

export interface PlanContextValue {
  state: PlanState;
  dispatch: React.Dispatch<PlanAction>;
  canUndo: boolean;
  canRedo: boolean;
}

// ─── Semester generator ───────────────────────────────────────────────────────
// Produces an ordered Fall/Spring/Summer sequence across the given year range.
//
// Order within each academic year N:
//   Fall N  →  Spring N+1  →  Summer N+1
//
// Covering academic years AY2025-26 through AY2028-29 gives:
//   Fall 2025, Spring 2026, Summer 2026,
//   Fall 2026, Spring 2027, Summer 2027,
//   Fall 2027, Spring 2028, Summer 2028,
//   Fall 2028, Spring 2029
// (No Summer after the final Spring because the plan ends at Spring 2029.)
//
// Status rules are derived from an injectable clock (getCurrentTerm) rather than
// frozen literals. The old code hardcoded `year === 2025 → past`, `2026 → current`,
// which silently mis-classified terms once the real date passed Spring 2026.

type SemesterStatus = 'past' | 'current' | 'future';
type Season = 'Fall' | 'Spring' | 'Summer';

/**
 * Chronological ordinal for a term. Within a calendar year the order is
 * Spring < Summer < Fall, so `year * 3 + rank` sorts every term across years.
 */
function termOrdinal(season: Season, year: number): number {
  const rank = season === 'Spring' ? 0 : season === 'Summer' ? 1 : 2;
  return year * 3 + rank;
}

/**
 * The academic term that contains `now`. Injectable clock — tests pass a fixed
 * Date. Month → season uses the UT calendar: Jan–May → Spring, Jun–Aug → Summer,
 * Sep–Dec → Fall.
 */
export function getCurrentTerm(now: Date = new Date()): { season: Season; year: number } {
  const month = now.getMonth(); // 0 = January
  const year = now.getFullYear();
  if (month <= 4) return { season: 'Spring', year };
  if (month <= 7) return { season: 'Summer', year };
  return { season: 'Fall', year };
}

/** Classify a term as past / current / future relative to `now`. */
function semesterStatus(season: Season, year: number, now: Date = new Date()): SemesterStatus {
  const current = getCurrentTerm(now);
  const ord = termOrdinal(season, year);
  const currentOrd = termOrdinal(current.season, current.year);
  if (ord < currentOrd) return 'past';
  if (ord === currentOrd) return 'current';
  return 'future';
}

function shortYear(year: number): string {
  return String(year).slice(2);
}

function semesterLabel(season: 'Fall' | 'Spring' | 'Summer', year: number): string {
  if (season === 'Fall')   return `Fall '${shortYear(year)}`;
  if (season === 'Spring') return `Sp '${shortYear(year)}`;
  return `Su '${shortYear(year)}`;
}

/**
 * Generate a semester list interleaving Fall, Spring, and Summer terms across
 * academic years from `startFallYear` through a final Spring.
 *
 * The last academic year ends with a Spring (no trailing Summer) to avoid
 * allocating an empty placeholder past the graduation horizon.
 */
export function generateSemesters(
  startFallYear: number,
  endSpringYear: number,
  now: Date = new Date()
): Semester[] {
  const semesters: Semester[] = [];
  for (let ay = startFallYear; ay < endSpringYear; ay++) {
    // Fall of AY
    semesters.push({
      id: `Fall ${ay}`,
      label: semesterLabel('Fall', ay),
      status: semesterStatus('Fall', ay, now),
      year: ay,
      season: 'Fall',
    });
    // Spring of AY+1
    const springYear = ay + 1;
    semesters.push({
      id: `Spring ${springYear}`,
      label: semesterLabel('Spring', springYear),
      status: semesterStatus('Spring', springYear, now),
      year: springYear,
      season: 'Spring',
    });
    // Summer of AY+1 — omit for the final academic year (no summer after last Spring)
    if (springYear < endSpringYear) {
      semesters.push({
        id: `Summer ${springYear}`,
        label: semesterLabel('Summer', springYear),
        status: semesterStatus('Summer', springYear, now),
        year: springYear,
        season: 'Summer',
      });
    }
  }
  return semesters;
}

// ─── Static Semester Sequence ─────────────────────────────────────────────────
// AY 2025-26 → AY 2028-29 (4 academic years; terminal Spring = 2029). The window
// span is intentionally fixed for the alpha (so persisted plan keys stay valid);
// only the past/current/future status is derived from the real clock at load.
// (The fixed 2025–2029 horizon is a deferred follow-up — it only goes stale well
// past alpha.)

export const SEMESTERS: Semester[] = generateSemesters(2025, 2029);

// ─── Semester reconciliation (rehydration fix) ────────────────────────────────
//
// When a persisted plan-state predates a SEMESTERS upgrade (e.g. TASK-051 added
// Summer terms to a previously Fall/Spring-only list), the stored semesters array
// is missing the new canonical entries.  This function merges the canonical list
// into the persisted one without losing:
//   • existing semester objects (their status may have been mutated by ADVANCE_SEMESTER)
//   • course placements (we only touch `state.semesters`, not `state.plan`)
//
// Algorithm:
//   1. Build a set of ids already in the persisted list.
//   2. For every canonical semester whose id is absent, insert it at the
//      chronologically correct position (index of canonical ordering).
//   3. Re-sort the merged list using the canonical index as the sort key;
//      semesters not present in the canonical list sort to the end.
//
// This is intentionally additive: it never removes or reorders existing semesters.

export function reconcileSemesters(persisted: Semester[]): Semester[] {
  const canonicalIds = SEMESTERS.map((s) => s.id);
  const persistedIds = new Set(persisted.map((s) => s.id));

  // Find canonical semesters missing from the persisted list
  const missing = SEMESTERS.filter((s) => !persistedIds.has(s.id));

  if (missing.length === 0) {
    // Nothing to add — return the original array reference unchanged
    return persisted;
  }

  // Merge and sort by canonical position; unknown ids sort to the end
  const merged = [...persisted, ...missing];
  merged.sort((a, b) => {
    const ia = canonicalIds.indexOf(a.id);
    const ib = canonicalIds.indexOf(b.id);
    // Both in canonical list: sort by canonical index
    if (ia !== -1 && ib !== -1) return ia - ib;
    // Only a is canonical: a comes first
    if (ia !== -1) return -1;
    // Only b is canonical: b comes first
    if (ib !== -1) return 1;
    // Neither canonical: preserve relative order (stable sort; a before b)
    return 0;
  });

  return merged;
}

// ─── Initial Plan (empty — tester starts fresh) ───────────────────────────────

export const INITIAL_PLAN: Record<string, string[]> = Object.fromEntries(
  SEMESTERS.map((s) => [s.id, []])
);

// ─── Demo Plan (Adi's transcript — matches user-profile.json completed/in-progress) ──

export const DEMO_PLAN: Record<string, string[]> = {
  ...INITIAL_PLAN,
  'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
  'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
};

export const INITIAL_STATE: PlanState = {
  semesters: SEMESTERS,
  plan: INITIAL_PLAN,
  pinnedCourses: [],
  hoveredCourse: null,
  whatIf: {
    techCoreId: 'computer_architecture',
    mathBAToggle: false,
    isActive: false,
  },
  gradeEntries: {},
  ghostCourses: {},
  rejectedGhosts: [],
  focusedGhostId: null,
  major: 'ece-bse',
  catalogYear: '2024',
};

export const STORAGE_KEY = 'degreeforge-plan-state';

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function planReducer(state: PlanState, action: PlanAction): PlanState {
  switch (action.type) {
    case 'ADD_COURSE': {
      // Reducer-level guard (layer B): silently drop invalid course tokens.
      if (!isValidCourseId(action.courseId)) return state;
      // Invariant 2: no writes to past terms (single source of truth).
      if (isPastSemester(action.semesterId, state.semesters)) return state;
      const alreadyPlaced = Object.values(state.plan).some((courses) =>
        courses.includes(action.courseId)
      );
      if (alreadyPlaced) return state;
      const existing = state.plan[action.semesterId] ?? [];
      return {
        ...state,
        plan: {
          ...state.plan,
          [action.semesterId]: [...existing, action.courseId],
        },
      };
    }

    case 'REMOVE_COURSE': {
      const existing = state.plan[action.semesterId] ?? [];
      return {
        ...state,
        plan: {
          ...state.plan,
          [action.semesterId]: existing.filter((id) => id !== action.courseId),
        },
      };
    }

    case 'MOVE_COURSE': {
      const fromExisting = state.plan[action.fromSemesterId] ?? [];
      const toExisting = state.plan[action.toSemesterId] ?? [];
      const isInTarget = toExisting.includes(action.courseId);
      if (!fromExisting.includes(action.courseId)) return state;
      if (isInTarget) return state;
      // Invariant 2: no writes to past terms (single source of truth).
      if (isPastSemester(action.toSemesterId, state.semesters)) return state;
      return {
        ...state,
        plan: {
          ...state.plan,
          [action.fromSemesterId]: fromExisting.filter((id) => id !== action.courseId),
          [action.toSemesterId]: [...toExisting, action.courseId],
        },
      };
    }

    case 'REORDER_SEMESTER': {
      // Reducer-level guard (layer B): strip invalid tokens from reordered list.
      const { safePlan: guardedReorder } = sanitizePlan({ [action.semesterId]: action.courseIds as unknown[] });
      return {
        ...state,
        plan: {
          ...state.plan,
          [action.semesterId]: guardedReorder[action.semesterId],
        },
      };
    }

    case 'SET_PLAN': {
      // Reducer-level guard (layer B): strip any invalid tokens from incoming plan.
      const { safePlan: guardedPlan } = sanitizePlan(action.plan as Record<string, unknown[]>);
      return { ...state, plan: guardedPlan };
    }

    case 'PIN_COURSE': {
      if (state.pinnedCourses.includes(action.courseId)) return state;
      // Clear rejected ghosts so the solver reruns fresh on each new pin
      return { ...state, pinnedCourses: [...state.pinnedCourses, action.courseId], rejectedGhosts: [] };
    }

    case 'UNPIN_COURSE': {
      return {
        ...state,
        pinnedCourses: state.pinnedCourses.filter((id) => id !== action.courseId),
        rejectedGhosts: [],
      };
    }

    case 'SET_HOVERED_COURSE': {
      return { ...state, hoveredCourse: action.courseId };
    }

    case 'SET_TECH_CORE': {
      return {
        ...state,
        whatIf: { ...state.whatIf, techCoreId: action.techCoreId },
      };
    }

    case 'TOGGLE_MATH_BA': {
      return {
        ...state,
        whatIf: { ...state.whatIf, mathBAToggle: action.enabled },
      };
    }

    case 'SEED_WHAT_IF': {
      // Seed staged values from Settings baseline without marking simulation active.
      // isActive is preserved — if a what-if was already applied, it stays applied.
      return {
        ...state,
        whatIf: {
          ...state.whatIf,
          techCoreId: action.techCoreId,
          mathBAToggle: action.mathBAToggle,
        },
      };
    }

    case 'APPLY_WHAT_IF': {
      // Reducer-level guard (layer B): strip any invalid tokens from the incoming plan.
      const { safePlan: guardedWhatIf } = sanitizePlan(action.newPlan as Record<string, unknown[]>);
      return {
        ...state,
        plan: guardedWhatIf,
        whatIf: { ...state.whatIf, isActive: true },
      };
    }

    case 'RESET_WHAT_IF': {
      return {
        ...state,
        whatIf: { ...state.whatIf, isActive: false },
      };
    }

    case 'SET_GHOST_COURSES': {
      const allGhosts: string[] = (Object.values(action.ghostCourses) as string[][]).flat();
      const firstGhost: string | null = allGhosts[0] ?? null;
      return { ...state, ghostCourses: action.ghostCourses, focusedGhostId: firstGhost };
    }

    case 'ACCEPT_GHOST': {
      const { courseId, semesterId } = action;
      // Invariant 2: no writes to past terms (single source of truth).
      if (isPastSemester(semesterId, state.semesters)) return state;
      // Remove from ghosts
      const newGhosts = { ...state.ghostCourses };
      if (newGhosts[semesterId]) {
        newGhosts[semesterId] = newGhosts[semesterId].filter((id) => id !== courseId);
        if (newGhosts[semesterId].length === 0) delete newGhosts[semesterId];
      }
      // Add to real plan (guard: don't double-add)
      const alreadyInPlan = Object.values(state.plan).some((ids) => ids.includes(courseId));
      const updatedPlan = alreadyInPlan
        ? state.plan
        : { ...state.plan, [semesterId]: [...(state.plan[semesterId] ?? []), courseId] };
      // Advance focusedGhostId to next remaining ghost
      const remaining = Object.values(newGhosts).flat();
      return {
        ...state,
        plan: updatedPlan,
        ghostCourses: newGhosts,
        focusedGhostId: remaining[0] ?? null,
      };
    }

    case 'REJECT_GHOST': {
      const rejected = state.rejectedGhosts.includes(action.courseId)
        ? state.rejectedGhosts
        : [...state.rejectedGhosts, action.courseId];
      // Remove from ghost display — hook will recompute with rejection
      const newGhosts: Record<string, string[]> = Object.fromEntries(
        Object.entries(state.ghostCourses)
          .map(([semId, ids]): [string, string[]] => [semId, ids.filter((id) => id !== action.courseId)])
          .filter(([, ids]) => ids.length > 0)
      );
      const remaining: string[] = Object.values(newGhosts).flat();
      return {
        ...state,
        ghostCourses: newGhosts,
        rejectedGhosts: rejected,
        focusedGhostId: remaining[0] ?? null,
      };
    }

    case 'DISMISS_GHOSTS': {
      // Add current ghosts to rejected so the hook doesn't immediately re-propose them
      const dismissed: string[] = (Object.values(state.ghostCourses) as string[][]).flat();
      const newRejected = [...new Set([...state.rejectedGhosts, ...dismissed])];
      return { ...state, ghostCourses: {}, rejectedGhosts: newRejected, focusedGhostId: null };
    }

    case 'SET_FOCUSED_GHOST': {
      return { ...state, focusedGhostId: action.courseId };
    }

    case 'SET_FULL_STATE': {
      // Reducer-level guard (layer B): strip any invalid tokens from imported plan.
      const { safePlan: guardedFullState } = sanitizePlan(action.state.plan as Record<string, unknown[]>);
      return { ...action.state, plan: guardedFullState };
    }

    case 'SET_PROFILE_META': {
      return {
        ...state,
        ...(action.major !== undefined ? { major: action.major } : {}),
        ...(action.catalogYear !== undefined ? { catalogYear: action.catalogYear } : {}),
      };
    }

    case 'ADVANCE_SEMESTER': {
      const currentIdx = state.semesters.findIndex((s) => s.status === 'current');
      if (currentIdx === -1) return state;
      const nextFutureIdx = state.semesters.findIndex((s) => s.status === 'future');
      if (nextFutureIdx === -1) return state;

      const currentSemId = state.semesters[currentIdx].id;
      const newSemesters = state.semesters.map((sem, idx) => {
        if (idx === currentIdx) return { ...sem, status: 'past' as const };
        if (idx === nextFutureIdx) return { ...sem, status: 'current' as const };
        return sem;
      });

      return {
        ...state,
        semesters: newSemesters,
        gradeEntries: {
          ...state.gradeEntries,
          [currentSemId]: action.grades,
        },
      };
    }

    default:
      return state;
  }
}

// ─── Undo / Redo Engine ───────────────────────────────────────────────────────

export interface HistoryState {
  past: PlanState[];
  present: PlanState;
  future: PlanState[];
}

// ─── Plan-state hydration (lazy-initializer body) ─────────────────────────────
//
// Pure parse → Zod-validate → reconcile → plan-backfill for the persisted plan
// blob. Extracted from the PlanProvider lazy initializer so the real / legacy /
// malformed branches are unit-testable without mounting React.
//
// Returns null when the stored string is unusable (malformed JSON, neither a
// HistoryState nor a legacy plan shape, or Zod-rejected). Returning null — rather
// than silently defaulting — lets the persistence seam (Theme A, lib/persist.ts)
// tell "corrupt" apart from "absent": it backs the raw blob up and warns the user
// instead of irreversibly wiping their only saved plan.

/**
 * Re-derive every semester's past/current/future status from the clock. Persisted
 * state froze its statuses at save time (and reconcileSemesters preserves them), so
 * without this the clock fix would be inert for any returning user — the planner
 * would keep showing whatever term was "current" when they last saved.
 */
function refreshSemesterStatuses(semesters: Semester[], now: Date = new Date()): Semester[] {
  return semesters.map((s) => {
    const status = semesterStatus(s.season, s.year, now);
    return status === s.status ? s : { ...s, status };
  });
}

/** Merge canonical semesters + refresh statuses + backfill empty plan entries. */
function reconcilePlanState(validated: PlanState): PlanState {
  const reconciledSemesters = refreshSemesterStatuses(reconcileSemesters(validated.semesters));
  const reconciledPlan = { ...validated.plan };
  for (const sem of reconciledSemesters) {
    if (!(sem.id in reconciledPlan)) reconciledPlan[sem.id] = [];
  }
  return { ...validated, semesters: reconciledSemesters, plan: reconciledPlan };
}

export function parseStoredPlan(rawStored: string): HistoryState | null {
  let parsed: { present?: { semesters?: unknown }; semesters?: unknown; plan?: unknown };
  try {
    parsed = JSON.parse(rawStored);
  } catch {
    return null;
  }

  // New HistoryState format: plan state is nested under `present`.
  if (parsed.present && parsed.present.semesters) {
    const validated = parsePlanState(parsed.present);
    return validated ? { past: [], present: reconcilePlanState(validated), future: [] } : null;
  }
  // Legacy migration (pre-HistoryState format): semesters/plan at top level.
  if (parsed.semesters && parsed.plan) {
    const validated = parsePlanState(parsed);
    return validated
      ? { past: [], present: { ...reconcilePlanState(validated), hoveredCourse: null }, future: [] }
      : null;
  }
  return null;
}

export function historyReducer(state: HistoryState, action: PlanAction): HistoryState {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, state.past.length - 1);
    return {
      past: newPast,
      present: previous,
      future: [state.present, ...state.future],
    };
  }

  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return {
      past: [...state.past, state.present],
      present: next,
      future: newFuture,
    };
  }

  if (action.type === 'RESET_PLAN') {
    return {
      past: [...state.past, state.present],
      present: {
        ...INITIAL_STATE,
        gradeEntries: state.present.gradeEntries // Preserve grades during reset
      },
      future: [],
    };
  }

  const nextPresent = planReducer(state.present, action);
  if (nextPresent === state.present) return state; // no state change

  const noHistoryActions: PlanAction['type'][] = [
    'SET_HOVERED_COURSE',
    'SET_GHOST_COURSES',
    'DISMISS_GHOSTS',
    'REJECT_GHOST',
    'SET_FOCUSED_GHOST',
  ];
  if (noHistoryActions.includes(action.type)) {
    return { ...state, present: nextPresent };
  }

  const newPast = [...state.past, state.present].slice(-30); // keep last 30 states
  return {
    past: newPast,
    present: nextPresent,
    future: [],
  };
}

// ─── Plan Snapshots ───────────────────────────────────────────────────────────

export interface PlanSnapshot {
  id: string;
  name: string;
  plan: Record<string, string[]>;
  createdAt: number;
}

export interface SnapshotState {
  snapshots: PlanSnapshot[];
  comparisonMode: 'off' | 'sidebar-diff' | 'split-view';
}

export type SnapshotAction =
  | { type: 'SAVE_SNAPSHOT'; plan: Record<string, string[]> }
  | { type: 'DELETE_SNAPSHOT'; id: string }
  | { type: 'RENAME_SNAPSHOT'; id: string; name: string }
  | { type: 'SET_COMPARISON_MODE'; mode: 'off' | 'sidebar-diff' | 'split-view' };

export const INITIAL_SNAPSHOT_STATE: SnapshotState = {
  snapshots: [],
  comparisonMode: 'off',
};

export function snapshotReducer(state: SnapshotState, action: SnapshotAction): SnapshotState {
  switch (action.type) {
    case 'SAVE_SNAPSHOT': {
      if (state.snapshots.length >= 3) return state;
      const nextNum = state.snapshots.length + 1;
      const newSnapshot: PlanSnapshot = {
        id: crypto.randomUUID(),
        name: `Snapshot ${nextNum}`,
        plan: action.plan,
        createdAt: Date.now(),
      };
      return {
        ...state,
        snapshots: [...state.snapshots, newSnapshot],
      };
    }
    case 'DELETE_SNAPSHOT': {
      return {
        ...state,
        snapshots: state.snapshots.filter(s => s.id !== action.id),
      };
    }
    case 'RENAME_SNAPSHOT': {
      return {
        ...state,
        snapshots: state.snapshots.map(s => s.id === action.id ? { ...s, name: action.name } : s),
      };
    }
    case 'SET_COMPARISON_MODE': {
      return { ...state, comparisonMode: action.mode };
    }
    default:
      return state;
  }
}

