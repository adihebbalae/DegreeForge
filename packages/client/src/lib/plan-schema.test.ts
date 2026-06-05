import { describe, it, expect } from 'vitest';
import { parsePlanState, parseSnapshotState, parseSettingsState } from './plan-schema';
import { DEFAULT_ENABLED_TOOLS } from './agent-tools/registry';

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

  it('backfills major and catalogYear defaults when absent (legacy export)', () => {
    const minimal = { semesters: [validSemester], plan: { 'Fall 2026': [] } };
    const result = parsePlanState(minimal);
    expect(result).not.toBeNull();
    expect(result?.major).toBe('ece-bse');
    expect(result?.catalogYear).toBe('2024');
  });

  it('preserves major and catalogYear when present', () => {
    const withMeta = { ...validPlanState, major: 'ece-bse', catalogYear: '2025' };
    const result = parsePlanState(withMeta);
    expect(result).not.toBeNull();
    expect(result?.major).toBe('ece-bse');
    expect(result?.catalogYear).toBe('2025');
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

const validFullSettings = {
  loadTolerance: 'heavy' as const,
  gradTarget: 'Fall 2027',
  techCoreId: 'vlsi',
  mathBAToggle: true,
  schedulerWeights: { gpa: 0.4, timeFit: 0.15, buildingPenalty: 0.05, instructionMode: 0.2, professorPreference: 0.1, daySpread: 0.1 },
  timeWindow: 'mornings_only' as const,
  instructionMode: 'online' as const,
  profPreferences: [{ name: 'Dr. Smith', type: 'prefer' as const }],
  paletteSortMode: 'easiest' as const,
};

describe('parseSettingsState', () => {
  it('returns intact object for valid full SettingsState', () => {
    const result = parseSettingsState(validFullSettings);
    expect(result).not.toBeNull();
    expect(result?.loadTolerance).toBe('heavy');
    expect(result?.gradTarget).toBe('Fall 2027');
    expect(result?.techCoreId).toBe('vlsi');
    expect(result?.mathBAToggle).toBe(true);
    expect(result?.schedulerWeights.gpa).toBe(0.4);
    expect(result?.timeWindow).toBe('mornings_only');
    expect(result?.instructionMode).toBe('online');
    expect(result?.profPreferences).toEqual([{ name: 'Dr. Smith', type: 'prefer' }]);
    expect(result?.paletteSortMode).toBe('easiest');
  });

  it('partial { loadTolerance: heavy } returns that value with all other fields defaulted', () => {
    const result = parseSettingsState({ loadTolerance: 'heavy' });
    expect(result).not.toBeNull();
    expect(result?.loadTolerance).toBe('heavy');
    expect(result?.gradTarget).toBe('Spring 2029');
    expect(result?.schedulerWeights).toEqual({ gpa: 0.35, timeFit: 0.20, buildingPenalty: 0.10, instructionMode: 0.15, professorPreference: 0.15, daySpread: 0.05 });
    expect(result?.profPreferences).toEqual([]);
  });

  it('returns null when schedulerWeights is a wrong type', () => {
    expect(parseSettingsState({ schedulerWeights: 'not-an-object' })).toBeNull();
  });

  it('returns null when profPreferences contains an invalid enum value', () => {
    expect(parseSettingsState({ profPreferences: [{ name: 'x', type: 'invalid' }] })).toBeNull();
  });

  it('returns fully-defaulted SettingsState for empty object', () => {
    const result = parseSettingsState({});
    expect(result).not.toBeNull();
    expect(result?.loadTolerance).toBe('above_average');
    expect(result?.gradTarget).toBe('Spring 2029');
    expect(result?.techCoreId).toBe('computer_architecture');
    expect(result?.mathBAToggle).toBe(false);
    expect(result?.schedulerWeights).toEqual({ gpa: 0.35, timeFit: 0.20, buildingPenalty: 0.10, instructionMode: 0.15, professorPreference: 0.15, daySpread: 0.05 });
    expect(result?.timeWindow).toBe('no_preference');
    expect(result?.instructionMode).toBe('no_preference');
    expect(result?.profPreferences).toEqual([]);
    expect(result?.paletteSortMode).toBe('recommended');
  });

  it('backfills enabledTools to the 6 default names when absent (legacy upgrade)', () => {
    // Simulates a persisted settings object that predates the enabledTools field
    const legacy = { loadTolerance: 'normal', gradTarget: 'Fall 2028' };
    const result = parseSettingsState(legacy);
    expect(result).not.toBeNull();
    const defaultNames = DEFAULT_ENABLED_TOOLS.map(t => t.name);
    expect(result?.enabledTools).toEqual(defaultNames);
    expect(result?.enabledTools).toHaveLength(6);
  });

  it('preserves enabledTools when explicitly provided', () => {
    const custom = { ...validFullSettings, enabledTools: ['get_course_info', 'search_catalog'] };
    const result = parseSettingsState(custom);
    expect(result).not.toBeNull();
    expect(result?.enabledTools).toEqual(['get_course_info', 'search_catalog']);
  });

  it('backfills enabledTools to 6 defaults for empty object', () => {
    const result = parseSettingsState({});
    expect(result).not.toBeNull();
    expect(result?.enabledTools).toHaveLength(6);
  });
});
