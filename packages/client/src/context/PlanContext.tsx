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
  | { type: 'SET_FULL_STATE'; state: PlanState };

// ─── Context Shape ────────────────────────────────────────────────────────────

interface PlanContextValue {
  state: PlanState;
  dispatch: React.Dispatch<PlanAction>;
}

// ─── Static Semester Sequence ─────────────────────────────────────────────────
// Today = April 15, 2026 → Spring 2026 is current.

const SEMESTERS: Semester[] = [
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

const INITIAL_PLAN: Record<string, string[]> = {
  'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
  'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
  'Fall 2026':   [],
  'Spring 2027': [],
  'Fall 2027':   [],
  'Spring 2028': [],
  'Fall 2028':   [],
  'Spring 2029': [],
};

const INITIAL_STATE: PlanState = {
  semesters: SEMESTERS,
  plan: INITIAL_PLAN,
  pinnedCourses: [],
  hoveredCourse: null,
  whatIf: {
    techCoreId: 'computer_architecture', // Default from Adi's profile
    mathBAToggle: false,
    isActive: false,
  },
};

const STORAGE_KEY = 'degreeforge-plan-state';

// ─── Reducer ──────────────────────────────────────────────────────────────────

function planReducer(state: PlanState, action: PlanAction): PlanState {
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
      return INITIAL_STATE;
    }

    case 'SET_FULL_STATE': {
      return action.state;
    }

    default:
      return state;
  }
}

// ─── Context + Provider ───────────────────────────────────────────────────────

const PlanContext = createContext<PlanContextValue | null>(null);

export function PlanProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(planReducer, INITIAL_STATE, (initial) => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Basic validation: ensure semesters and plan exist
        if (parsed.semesters && parsed.plan) {
          return { ...initial, ...parsed, hoveredCourse: null };
        }
      } catch (e) {
        console.error('Failed to parse stored plan state:', e);
      }
    }
    return initial;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return (
    <PlanContext.Provider value={{ state, dispatch }}>
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

/** Returns the course IDs placed in a specific semester */
export function useSemesterCourses(semesterId: string): string[] {
  return usePlanContext().state.plan[semesterId] ?? [];
}
