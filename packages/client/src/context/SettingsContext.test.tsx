import { describe, it, expect } from 'vitest';
import {
  settingsReducer,
  DEFAULT_SETTINGS,
  type SettingsState,
  type SettingsAction,
} from './SettingsContext';

describe('settingsReducer', () => {
  it('returns default state unchanged for unknown action', () => {
    const state = settingsReducer(DEFAULT_SETTINGS, { type: 'RESET_SETTINGS' });
    expect(state).toEqual(DEFAULT_SETTINGS);
  });

  it('SET_LOAD_TOLERANCE updates loadTolerance', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'SET_LOAD_TOLERANCE', value: 'light' });
    expect(next.loadTolerance).toBe('light');
    expect(next.gradTarget).toBe(DEFAULT_SETTINGS.gradTarget); // other fields unchanged
  });

  it('SET_GRAD_TARGET updates gradTarget', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'SET_GRAD_TARGET', value: 'Fall 2028' });
    expect(next.gradTarget).toBe('Fall 2028');
  });

  it('SET_TECH_CORE updates techCoreId', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'SET_TECH_CORE', value: 'data_science' });
    expect(next.techCoreId).toBe('data_science');
  });

  it('SET_MATH_BA updates mathBAToggle', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'SET_MATH_BA', value: true });
    expect(next.mathBAToggle).toBe(true);
  });

  it('SET_SCHEDULER_WEIGHTS merges partial weights', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, {
      type: 'SET_SCHEDULER_WEIGHTS',
      weights: { gpa: 0.5, timeFit: 0.1 },
    });
    expect(next.schedulerWeights.gpa).toBe(0.5);
    expect(next.schedulerWeights.timeFit).toBe(0.1);
    // untouched fields preserved
    expect(next.schedulerWeights.buildingPenalty).toBe(DEFAULT_SETTINGS.schedulerWeights.buildingPenalty);
  });

  it('SET_TIME_WINDOWS updates timeWindow', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'SET_TIME_WINDOWS', value: 'mornings_only' });
    expect(next.timeWindow).toBe('mornings_only');
  });

  it('SET_INSTRUCTION_MODE updates instructionMode', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'SET_INSTRUCTION_MODE', value: 'online' });
    expect(next.instructionMode).toBe('online');
  });

  it('ADD_PROF_PREFERENCE appends a new preference', () => {
    const next = settingsReducer(DEFAULT_SETTINGS, {
      type: 'ADD_PROF_PREFERENCE',
      pref: { name: 'Dr. Smith', type: 'prefer' },
    });
    expect(next.profPreferences).toHaveLength(1);
    expect(next.profPreferences[0]).toEqual({ name: 'Dr. Smith', type: 'prefer' });
  });

  it('ADD_PROF_PREFERENCE replaces existing entry with same name', () => {
    const withPref: SettingsState = {
      ...DEFAULT_SETTINGS,
      profPreferences: [{ name: 'Dr. Smith', type: 'prefer' }],
    };
    const next = settingsReducer(withPref, {
      type: 'ADD_PROF_PREFERENCE',
      pref: { name: 'Dr. Smith', type: 'avoid' },
    });
    expect(next.profPreferences).toHaveLength(1);
    expect(next.profPreferences[0].type).toBe('avoid');
  });

  it('REMOVE_PROF_PREFERENCE removes by name', () => {
    const withPref: SettingsState = {
      ...DEFAULT_SETTINGS,
      profPreferences: [
        { name: 'Dr. Smith', type: 'prefer' },
        { name: 'Dr. Jones', type: 'avoid' },
      ],
    };
    const next = settingsReducer(withPref, { type: 'REMOVE_PROF_PREFERENCE', name: 'Dr. Smith' });
    expect(next.profPreferences).toHaveLength(1);
    expect(next.profPreferences[0].name).toBe('Dr. Jones');
  });

  it('RESET_SETTINGS returns DEFAULT_SETTINGS', () => {
    const modified: SettingsState = {
      ...DEFAULT_SETTINGS,
      loadTolerance: 'heavy',
      techCoreId: 'data_science',
      profPreferences: [{ name: 'Dr. X', type: 'avoid' }],
    };
    const next = settingsReducer(modified, { type: 'RESET_SETTINGS' });
    expect(next).toEqual(DEFAULT_SETTINGS);
  });

  it('SET_FULL_SETTINGS replaces state entirely', () => {
    const custom: SettingsState = {
      ...DEFAULT_SETTINGS,
      loadTolerance: 'heavy',
      gradTarget: 'Fall 2027',
      techCoreId: 'software_engineering',
      mathBAToggle: true,
      profPreferences: [{ name: 'Dr. Y', type: 'prefer' }],
    };
    const next = settingsReducer(DEFAULT_SETTINGS, { type: 'SET_FULL_SETTINGS', settings: custom });
    expect(next).toEqual(custom);
  });

  it('is pure — does not mutate state', () => {
    const original = { ...DEFAULT_SETTINGS };
    settingsReducer(DEFAULT_SETTINGS, { type: 'SET_LOAD_TOLERANCE', value: 'heavy' });
    expect(DEFAULT_SETTINGS.loadTolerance).toBe(original.loadTolerance);
  });
});
