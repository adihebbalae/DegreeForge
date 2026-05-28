import { describe, it, expect } from 'vitest';
import { parsePlanState, parseSnapshotState } from './plan-schema';

const validSemester = {
  id: 'Fall 2026',
  label: "Fall '26",
  status: 'future' as const,
  year: 2026,
  season: 'Fall' as const,
};

const validPlanState = {
  semesters: [validSemester],
  plan: { 'Fall 2026': ['ECE 302'] },
  pinnedCourses: ['ECE 302'],
  hoveredCourse: null,
  whatIf: { techCoreId: 'computer_architecture', mathBAToggle: false, isActive: false },
  gradeEntries: { 'Fall 2025': { 'ECE 302': 'A' } },
  ghostCourses: {},
  rejectedGhosts: [],
  focusedGhostId: null,
};

describe('parsePlanState', () => {
  it('returns intact object for valid full PlanState', () => {
    const result = parsePlanState(validPlanState);
    expect(result).not.toBeNull();
    expect(result?.semesters[0].id).toBe('Fall 2026');
    expect(result?.plan['Fall 2026']).toEqual(['ECE 302']);
    expect(result?.pinnedCourses).toEqual(['ECE 302']);
    expect(result?.whatIf.techCoreId).toBe('computer_architecture');
  });

  it('applies defaults for minimal valid input', () => {
    const minimal = { semesters: [validSemester], plan: { 'Fall 2026': [] } };
    const result = parsePlanState(minimal);
    expect(result).not.toBeNull();
    expect(result?.pinnedCourses).toEqual([]);
    expect(result?.hoveredCourse).toBeNull();
    expect(result?.ghostCourses).toEqual({});
    expect(result?.rejectedGhosts).toEqual([]);
    expect(result?.focusedGhostId).toBeNull();
    expect(result?.whatIf).toEqual({ techCoreId: '', mathBAToggle: false, isActive: false });
  });

  it('returns null when semesters array contains a null element', () => {
    const bad = { semesters: [null], plan: {} };
    expect(parsePlanState(bad)).toBeNull();
  });

  it('returns null when plan value is not an array', () => {
    const bad = { semesters: [], plan: { 'Fall 2026': 'not-an-array' } };
    expect(parsePlanState(bad)).toBeNull();
  });

  it('returns null when semesters is missing', () => {
    const bad = { plan: { 'Fall 2026': [] } };
    expect(parsePlanState(bad)).toBeNull();
  });

  it('returns null for null input', () => {
    expect(parsePlanState(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parsePlanState('string')).toBeNull();
  });
});

describe('parseSnapshotState', () => {
  it('returns intact object for valid snapshot state', () => {
    const valid = {
      snapshots: [{ id: 'abc', name: 'Snap 1', plan: { 'Fall 2026': ['ECE 302'] }, createdAt: 1000 }],
      comparisonMode: 'sidebar-diff' as const,
    };
    const result = parseSnapshotState(valid);
    expect(result).not.toBeNull();
    expect(result?.snapshots[0].id).toBe('abc');
    expect(result?.comparisonMode).toBe('sidebar-diff');
  });

  it('returns null when snapshots is null', () => {
    expect(parseSnapshotState({ snapshots: null })).toBeNull();
  });

  it('returns null when a snapshot element has wrong id type', () => {
    const bad = { snapshots: [{ id: 1, name: 'x', plan: {}, createdAt: 0 }] };
    expect(parseSnapshotState(bad)).toBeNull();
  });

  it('defaults comparisonMode to off for empty snapshots array', () => {
    const result = parseSnapshotState({ snapshots: [] });
    expect(result).not.toBeNull();
    expect(result?.comparisonMode).toBe('off');
    expect(result?.snapshots).toEqual([]);
  });
});
