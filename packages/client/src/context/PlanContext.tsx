import React, { createContext, useContext, useReducer, useEffect } from 'react';
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
  | { type: 'APPLY_WHAT_IF'; newPlan: Record<string, string[]> }
  | { type: 'RESET_WHAT_IF' }
  | { type: 'RESET_PLAN' }
  | { type: 'SET_FULL_STATE'; state: PlanState }
  | { type: 'ADVANCE_SEMESTER'; grades: Record<string, string> }
  | { type: 'UNDO' }
  | { type: 'REDO' };

// ─── Context Shape ────────────────────────────────────────────────────────────

interface PlanContextValue {
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
};

const STORAGE_KEY = 'degreeforge-plan-state';

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
      const fromCourses = (state.plan[action.fromSemesterId] ?? []).filter(
        (id) => id !== action.courseId
      );
      const toCourses = state.plan[action.toSemesterId] ?? [];
      if (toCourses.includes(action.courseId)) return state;
      return {
        ...state,
        plan: {
          ...state.plan,
          [action.fromSemesterId]: fromCourses,
          [action.toSemesterId]: [...toCourses, action.courseId],
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
      return { ...state, pinnedCourses: [...state.pinnedCourses, action.courseId] };
    }

    case 'UNPIN_COURSE': {
      return {
        ...state,
        pinnedCourses: state.pinnedCourses.filter((id) => id !== action.courseId),
      };
    }

    case 'SET_HOVERED_COURSE': {
      return { ...state, hoveredCourse: action.courseId };
    }

    case 'SET_TECH_CORE': {
      return {
        ...state,
        whatIf: {
          ...state.whatIf,
          techCoreId: action.techCoreId,
          isActive: true,
        },
      };
    }

    case 'TOGGLE_MATH_BA': {
      return {
        ...state,
        whatIf: {
          ...state.whatIf,
          mathBAToggle: action.enabled,
          isActive: true,
        },
      };
    }

    case 'APPLY_WHAT_IF': {
      return {
        ...state,
        plan: action.newPlan,
        whatIf: {
          ...state.whatIf,
          isActive: false,
        },
      };
    }

    case 'RESET_WHAT_IF': {
      return {
        ...state,
        whatIf: INITIAL_STATE.whatIf,
      };
    }

    case 'RESET_PLAN': {
      return { ...INITIAL_STATE, gradeEntries: state.gradeEntries };
    }

    case 'SET_FULL_STATE': {
      return action.state;
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

  // Actions that should NOT save history
  if (action.type === 'SET_HOVERED_COURSE') {
    return { ...state, present: nextPresent };
  }

  const newPast = [...state.past, state.present].slice(-30); // keep last 30 states
  return {
    past: newPast,
    present: nextPresent,
    future: [],
  };
}

// ─── Context + Provider ───────────────────────────────────────────────────────

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [historyState, dispatch] = useReducer(historyReducer, {
    past: [],
    present: INITIAL_STATE,
    future: [],
  }, (initial) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);

        // Helper: repair corrupted plans where the solver dumped all completed
        // courses into a single past semester (the "44 hours in Fall 2025" bug).
        const repairPlan = (state: PlanState): PlanState => {
          const maxCoursesInPastSemester = 8; // No real semester should have >8
          let needsRepair = false;
          for (const sem of state.semesters) {
            if (sem.status === 'past' || sem.status === 'current') {
              const courses = state.plan[sem.id] || [];
              if (courses.length > maxCoursesInPastSemester) {
                needsRepair = true;
                break;
              }
            }
          }
          if (!needsRepair) return state;

          // Restore past/current semesters from INITIAL_PLAN, keep future
          const repairedPlan = { ...state.plan };
          for (const sem of state.semesters) {
            if (sem.status === 'past' || sem.status === 'current') {
              repairedPlan[sem.id] = [...(INITIAL_PLAN[sem.id] || [])];
            }
          }
          return { ...state, plan: repairedPlan };
        };

        // If it has present, it's the new HistoryState format
        if (parsed.present && parsed.present.semesters) {
          const repairedPresent = repairPlan(parsed.present);
          return { ...initial, ...parsed, present: repairedPresent, past: [], future: [] };
        }
        // Legacy migration
        if (parsed.semesters && parsed.plan) {
          const restored = { ...INITIAL_STATE, ...parsed, hoveredCourse: null };
          return { ...initial, present: repairPlan(restored) };
        }
      } catch (e) {
        console.error('Failed to parse stored plan state:', e);
      }
    }
    return initial;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(historyState));
  }, [historyState]);

  return (
    <PlanContext.Provider value={{
      state: historyState.present,
      dispatch,
      canUndo: historyState.past.length > 0,
      canRedo: historyState.future.length > 0,
    }}>
      {children}
    </PlanContext.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function usePlanContext(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) {
    throw new Error('usePlanContext must be called inside a <PlanProvider>.');
  }
  return ctx;
}

export function useSemesters(): Semester[] {
  return usePlanContext().state.semesters;
}

export function usePlan(): Record<string, string[]> {
  return usePlanContext().state.plan;
}

export function usePinnedCourses(): string[] {
  return usePlanContext().state.pinnedCourses;
}

export function useHoveredCourse(): string | null {
  return usePlanContext().state.hoveredCourse;
}

export function useWhatIf(): WhatIfState {
  return usePlanContext().state.whatIf;
}

export function useTechCoreId(): string {
  return usePlanContext().state.whatIf.techCoreId;
}

export function useMathBAToggle(): boolean {
  return usePlanContext().state.whatIf.mathBAToggle;
}

export function usePlanDispatch(): React.Dispatch<PlanAction> {
  return usePlanContext().dispatch;
}

export function useCanUndo(): boolean {
  return usePlanContext().canUndo;
}

export function useCanRedo(): boolean {
  return usePlanContext().canRedo;
}

/** Returns the course IDs placed in a specific semester */
export function useSemesterCourses(semesterId: string): string[] {
  return usePlanContext().state.plan[semesterId] ?? [];
}

/** Returns user-entered grades: semesterId → courseId → letter grade */
export function useGradeEntries(): Record<string, Record<string, string>> {
  return usePlanContext().state.gradeEntries ?? {};
}
