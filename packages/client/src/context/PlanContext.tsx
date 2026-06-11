import React, { createContext, useContext, useReducer, useEffect } from 'react';
import type { PlanState, Semester, WhatIfState } from '../types';
import {
  type PlanAction,
  type PlanContextValue,
  type HistoryState,
  INITIAL_STATE,
  STORAGE_KEY,
  historyReducer,
  snapshotReducer,
  INITIAL_SNAPSHOT_STATE,
  type SnapshotState,
  type SnapshotAction,
  type PlanSnapshot,
  reconcileSemesters,
} from './PlanContext.constants';
import { parsePlanState, parseSnapshotState } from '../lib/plan-schema';
import { useSettings } from './SettingsContext';

// ─── Re-export constants for backward compatibility ───────────────────────────
export { SEMESTERS, INITIAL_PLAN, DEMO_PLAN, INITIAL_STATE, planReducer, historyReducer } from './PlanContext.constants';
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

        // If it has present, it's the new HistoryState format.
        // Validate through Zod before use: rejects malformed/tampered state and
        // backfills fields added in later versions (e.g. ghostCourses) via per-field defaults.
        if (parsed.present && parsed.present.semesters) {
          const validated = parsePlanState(parsed.present);
          if (validated) {
            // Merge any canonical semesters missing from the persisted list (e.g.
            // Summer terms added by TASK-051 for users whose state predates that change).
            // Also backfill empty plan entries for newly-added semesters so the
            // plan record stays coherent with the semesters list.
            const reconciledSemesters = reconcileSemesters(validated.semesters);
            const reconciledPlan = { ...validated.plan };
            for (const sem of reconciledSemesters) {
              if (!(sem.id in reconciledPlan)) reconciledPlan[sem.id] = [];
            }
            const reconciled = { ...validated, semesters: reconciledSemesters, plan: reconciledPlan };
            return { ...initial, present: reconciled, past: [], future: [] };
          }
        }
        // Legacy migration (pre-HistoryState format).
        else if (parsed.semesters && parsed.plan) {
          const validated = parsePlanState(parsed);
          if (validated) {
            const reconciledSemesters = reconcileSemesters(validated.semesters);
            const reconciledPlan = { ...validated.plan };
            for (const sem of reconciledSemesters) {
              if (!(sem.id in reconciledPlan)) reconciledPlan[sem.id] = [];
            }
            const reconciled = { ...validated, semesters: reconciledSemesters, plan: reconciledPlan };
            return { ...initial, present: { ...reconciled, hoveredCourse: null } };
          }
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

// Read the baseline techCoreId/mathBAToggle from SettingsContext (single source
// of truth). The whatIf object still carries the *staged simulation* values
// used by ProgressBars and WhatIfPanel when a what-if is active.
export function useTechCoreId(): string {
  return useSettings().techCoreId;
}

export function useMathBAToggle(): boolean {
  return useSettings().mathBAToggle;
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
        const validated = parseSnapshotState(JSON.parse(stored));
        if (validated) return validated;
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
