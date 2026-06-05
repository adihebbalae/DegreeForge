import type { PlanState, Semester, WhatIfState } from '../types';

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

// ─── Static Semester Sequence ─────────────────────────────────────────────────
// Today = April 15, 2026 → Spring 2026 is current.

export const SEMESTERS: Semester[] = [
  { id: 'Fall 2025',   label: "Fall '25", status: 'past',    year: 2025, season: 'Fall'   },
  { id: 'Spring 2026', label: "Sp '26",   status: 'current', year: 2026, season: 'Spring' },
  { id: 'Fall 2026',   label: "Fall '26", status: 'future',  year: 2026, season: 'Fall'   },
  { id: 'Spring 2027', label: "Sp '27",   status: 'future',  year: 2027, season: 'Spring' },
  { id: 'Fall 2027',   label: "Fall '27", status: 'future',  year: 2027, season: 'Fall'   },
  { id: 'Spring 2028', label: "Sp '28",   status: 'future',  year: 2028, season: 'Spring' },
  { id: 'Fall 2028',   label: "Fall '28", status: 'future',  year: 2028, season: 'Fall'   },
  { id: 'Spring 2029', label: "Sp '29",   status: 'future',  year: 2029, season: 'Spring' },
];

// ─── Initial Plan (from Adi's transcript) ─────────────────────────────────────

export const INITIAL_PLAN: Record<string, string[]> = {
  'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
  'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
  'Fall 2026':   [],
  'Spring 2027': [],
  'Fall 2027':   [],
  'Spring 2028': [],
  'Fall 2028':   [],
  'Spring 2029': [],
};

export const INITIAL_STATE: PlanState = {
  semesters: SEMESTERS,
  plan: INITIAL_PLAN,
  pinnedCourses: [],
  hoveredCourse: null,
  whatIf: {
    techCoreId: 'computer_architecture', // Default from Adi's profile
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
      return {
        ...state,
        plan: {
          ...state.plan,
          [action.semesterId]: action.courseIds,
        },
      };
    }

    case 'SET_PLAN': {
      return { ...state, plan: action.plan };
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
      return {
        ...state,
        plan: action.newPlan,
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
      return action.state;
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

