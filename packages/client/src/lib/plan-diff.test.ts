import { describe, it, expect } from 'vitest';
import { computePlanDiff, type PlanDiff } from './plan-diff';
import type { PlanSnapshot } from '@/context/PlanContext.constants';
import { snapshotReducer, type SnapshotState, type SnapshotAction } from '@/context/PlanContext.constants';

// ─── computePlanDiff Tests ────────────────────────────────────────────────────

describe('computePlanDiff', () => {
  it('returns empty diff for two empty plans', () => {
    const diff = computePlanDiff({}, {});
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.moved).toEqual([]);
  });

  it('returns empty diff for identical plans', () => {
    const plan = {
      'Fall 2025': ['ECE 302', 'ECE 306'],
      'Spring 2026': ['ECE 312H'],
    };
    const diff = computePlanDiff(plan, plan);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.moved).toEqual([]);
  });

  it('detects added courses (in B but not in A)', () => {
    const planA = { 'Fall 2025': ['ECE 302'] };
    const planB = { 'Fall 2025': ['ECE 302', 'ECE 306'], 'Spring 2026': ['M 427J'] };
    const diff = computePlanDiff(planA, planB);

    expect(diff.added).toHaveLength(2);
    expect(diff.added).toContainEqual({ courseId: 'ECE 306', semester: 'Fall 2025' });
    expect(diff.added).toContainEqual({ courseId: 'M 427J', semester: 'Spring 2026' });
    expect(diff.removed).toEqual([]);
    expect(diff.moved).toEqual([]);
  });

  it('detects removed courses (in A but not in B)', () => {
    const planA = { 'Fall 2025': ['ECE 302', 'ECE 306'] };
    const planB = { 'Fall 2025': ['ECE 302'] };
    const diff = computePlanDiff(planA, planB);

    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]).toEqual({ courseId: 'ECE 306', semester: 'Fall 2025' });
    expect(diff.added).toEqual([]);
    expect(diff.moved).toEqual([]);
  });

  it('detects moved courses (same course, different semester)', () => {
    const planA = { 'Fall 2025': ['ECE 302'], 'Spring 2026': [] };
    const planB = { 'Fall 2025': [], 'Spring 2026': ['ECE 302'] };
    const diff = computePlanDiff(planA, planB);

    expect(diff.moved).toHaveLength(1);
    expect(diff.moved[0]).toEqual({
      courseId: 'ECE 302',
      fromSemester: 'Fall 2025',
      toSemester: 'Spring 2026',
    });
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('handles mixed changes (add + remove + move)', () => {
    const planA = {
      'Fall 2025': ['ECE 302', 'ECE 306'],
      'Spring 2026': ['M 427J'],
    };
    const planB = {
      'Fall 2025': ['ECE 302'],
      'Spring 2026': ['ECE 306', 'ECE 312H'], // ECE 306 moved, ECE 312H added, M 427J removed
    };
    const diff = computePlanDiff(planA, planB);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]).toEqual({ courseId: 'ECE 312H', semester: 'Spring 2026' });

    expect(diff.removed).toHaveLength(1);
    expect(diff.removed[0]).toEqual({ courseId: 'M 427J', semester: 'Spring 2026' });

    expect(diff.moved).toHaveLength(1);
    expect(diff.moved[0]).toEqual({
      courseId: 'ECE 306',
      fromSemester: 'Fall 2025',
      toSemester: 'Spring 2026',
    });
  });

  it('handles plan A empty and plan B non-empty (all added)', () => {
    const planA: Record<string, string[]> = {};
    const planB = { 'Fall 2025': ['ECE 302'] };
    const diff = computePlanDiff(planA, planB);

    expect(diff.added).toHaveLength(1);
    expect(diff.added[0]).toEqual({ courseId: 'ECE 302', semester: 'Fall 2025' });
    expect(diff.removed).toEqual([]);
    expect(diff.moved).toEqual([]);
  });

  it('handles plan B empty and plan A non-empty (all removed)', () => {
    const planA = { 'Fall 2025': ['ECE 302', 'ECE 306'] };
    const planB: Record<string, string[]> = {};
    const diff = computePlanDiff(planA, planB);

    expect(diff.removed).toHaveLength(2);
    expect(diff.added).toEqual([]);
    expect(diff.moved).toEqual([]);
  });
});

// ─── Snapshot Reducer Tests ───────────────────────────────────────────────────

function makeInitialSnapshotState(): SnapshotState {
  return {
    snapshots: [],
    comparisonMode: 'off',
  };
}

const samplePlan: Record<string, string[]> = {
  'Fall 2025': ['ECE 302', 'ECE 306'],
  'Spring 2026': ['ECE 312H'],
};

describe('snapshotReducer', () => {
  it('SAVE_SNAPSHOT: creates a new snapshot with the given plan', () => {
    const state = makeInitialSnapshotState();
    const next = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });

    expect(next.snapshots).toHaveLength(1);
    expect(next.snapshots[0].plan).toEqual(samplePlan);
    expect(next.snapshots[0].name).toBe('Snapshot 1');
    expect(typeof next.snapshots[0].id).toBe('string');
    expect(typeof next.snapshots[0].createdAt).toBe('number');
  });

  it('SAVE_SNAPSHOT: enforces max 3 snapshots', () => {
    let state = makeInitialSnapshotState();
    state = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });
    state = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });
    state = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });

    expect(state.snapshots).toHaveLength(3);

    // Fourth should be rejected
    const next = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });
    expect(next.snapshots).toHaveLength(3);
    expect(next).toBe(state); // no state change
  });

  it('SAVE_SNAPSHOT: increments name automatically', () => {
    let state = makeInitialSnapshotState();
    state = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });
    state = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });

    expect(state.snapshots[0].name).toBe('Snapshot 1');
    expect(state.snapshots[1].name).toBe('Snapshot 2');
  });

  it('DELETE_SNAPSHOT: removes snapshot by id', () => {
    let state = makeInitialSnapshotState();
    state = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });
    const id = state.snapshots[0].id;

    const next = snapshotReducer(state, { type: 'DELETE_SNAPSHOT', id });
    expect(next.snapshots).toHaveLength(0);
  });

  it('RENAME_SNAPSHOT: updates name by id', () => {
    let state = makeInitialSnapshotState();
    state = snapshotReducer(state, { type: 'SAVE_SNAPSHOT', plan: samplePlan });
    const id = state.snapshots[0].id;

    const next = snapshotReducer(state, { type: 'RENAME_SNAPSHOT', id, name: 'My Plan v2' });
    expect(next.snapshots[0].name).toBe('My Plan v2');
  });

  it('SET_COMPARISON_MODE: updates comparisonMode', () => {
    const state = makeInitialSnapshotState();
    const next = snapshotReducer(state, { type: 'SET_COMPARISON_MODE', mode: 'split-view' });
    expect(next.comparisonMode).toBe('split-view');
  });

  it('SET_COMPARISON_MODE: cycles through modes', () => {
    let state = makeInitialSnapshotState();
    state = snapshotReducer(state, { type: 'SET_COMPARISON_MODE', mode: 'sidebar-diff' });
    expect(state.comparisonMode).toBe('sidebar-diff');
    state = snapshotReducer(state, { type: 'SET_COMPARISON_MODE', mode: 'split-view' });
    expect(state.comparisonMode).toBe('split-view');
    state = snapshotReducer(state, { type: 'SET_COMPARISON_MODE', mode: 'off' });
    expect(state.comparisonMode).toBe('off');
  });
});
