import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { PlanState, Semester, WhatIfState } from '../types';
import {
  type PlanAction,
  type PlanContextValue,
  type HistoryState,
  INITIAL_PLAN,
  INITIAL_STATE,
  STORAGE_KEY,
  historyReducer,
  snapshotReducer,
  INITIAL_SNAPSHOT_STATE,
  type SnapshotState,
  type SnapshotAction,
  type PlanSnapshot,
} from './PlanContext.constants';

// ─── Re-export constants for backward compatibility ───────────────────────────
export { SEMESTERS, INITIAL_PLAN, INITIAL_STATE, planReducer } from './PlanContext.constants';
export type { PlanAction } from './PlanContext.constants';

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
          // Merge defaults so fields added in later versions (e.g. ghostCourses)
          // are present even when the stored state predates them.
          const mergedPresent = { ...INITIAL_STATE, ...parsed.present };
          const repairedPresent = repairPlan(mergedPresent);
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

// ─── TASK-019: Ghost-card hooks ───────────────────────────────────────────────

export function useGhostCourses(): Record<string, string[]> {
  return usePlanContext().state.ghostCourses;
}

export function useRejectedGhosts(): string[] {
  return usePlanContext().state.rejectedGhosts;
}

export function useFocusedGhostId(): string | null {
  return usePlanContext().state.focusedGhostId;
}

// ─── Plan Snapshots ───────────────────────────────────────────────────────────

interface SnapshotContextValue {
  state: SnapshotState;
  dispatch: React.Dispatch<SnapshotAction>;
}

const SnapshotContext = createContext<SnapshotContextValue | null>(null);

export function SnapshotProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(snapshotReducer, INITIAL_SNAPSHOT_STATE, (initial) => {
    const stored = localStorage.getItem('degreeforge-snapshots');
    if (stored) {
      try {
        return { ...initial, ...JSON.parse(stored) };
      } catch (e) {
        console.error('Failed to parse stored snapshots:', e);
      }
    }
    return initial;
  });

  useEffect(() => {
    localStorage.setItem('degreeforge-snapshots', JSON.stringify(state));
  }, [state]);

  return (
    <SnapshotContext.Provider value={{ state, dispatch }}>
      {children}
    </SnapshotContext.Provider>
  );
}

function useSnapshotContext(): SnapshotContextValue {
  const ctx = useContext(SnapshotContext);
  if (!ctx) throw new Error('useSnapshotContext must be called inside a <SnapshotProvider>.');
  return ctx;
}

export function useSnapshots(): PlanSnapshot[] {
  return useSnapshotContext().state.snapshots;
}

export function useComparisonMode(): 'off' | 'sidebar-diff' | 'split-view' {
  return useSnapshotContext().state.comparisonMode;
}

export function useSnapshotDispatch(): React.Dispatch<SnapshotAction> {
  return useSnapshotContext().dispatch;
}
