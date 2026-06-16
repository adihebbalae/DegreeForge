import { describe, it, expect } from 'vitest';
import { profileReducer, EMPTY_PROFILE } from './ProfileContext';
import type { UserProfile } from '../types';

const DEMO_COMPLETED: UserProfile['completed_courses'][number] = {
  course: 'ECE 302',
  title: 'Intro to EE',
  grade: 'A',
  semester: 'Fall 2025',
  type: 'In residence',
  credit_hours: 3,
};

const DEMO_INPROGRESS: UserProfile['in_progress_courses'][number] = {
  course: 'ECE 312H',
  title: 'Software I Honors',
  semester: 'Spring 2026',
  credit_hours: 3,
};

const DEMO_PROFILE: UserProfile = {
  ...EMPTY_PROFILE,
  name: 'Example Student',
  eid: 'EXAMPLE',
  completed_courses: [DEMO_COMPLETED],
  in_progress_courses: [DEMO_INPROGRESS],
};

describe('profileReducer', () => {
  // ─── SET_PROFILE ────────────────────────────────────────────────────────────
  it('SET_PROFILE replaces entire profile', () => {
    const result = profileReducer(EMPTY_PROFILE, { type: 'SET_PROFILE', profile: DEMO_PROFILE });
    expect(result.name).toBe('Example Student');
    expect(result.eid).toBe('EXAMPLE');
    expect(result.completed_courses).toHaveLength(1);
    expect(result.in_progress_courses).toHaveLength(1);
  });

  // Theme B: SET_PROFILE is a course-identity ingress — invalid course codes must
  // be dropped here so they never reach the solver/progress through the verbatim
  // reducer return.
  it('SET_PROFILE drops completed/in-progress courses with invalid course ids', () => {
    const dirty: UserProfile = {
      ...DEMO_PROFILE,
      completed_courses: [DEMO_COMPLETED, { ...DEMO_COMPLETED, course: 'JUNK' }],
      in_progress_courses: [DEMO_INPROGRESS, { ...DEMO_INPROGRESS, course: 'NEEDS REVIEW' }],
    };
    const result = profileReducer(EMPTY_PROFILE, { type: 'SET_PROFILE', profile: dirty });
    expect(result.completed_courses.map((c) => c.course)).toEqual(['ECE 302']);
    expect(result.in_progress_courses.map((c) => c.course)).toEqual(['ECE 312H']);
  });

  // ─── UPDATE_PROFILE_FIELD ───────────────────────────────────────────────────
  it('UPDATE_PROFILE_FIELD updates a single field shallowly', () => {
    const result = profileReducer(EMPTY_PROFILE, {
      type: 'UPDATE_PROFILE_FIELD',
      field: 'name',
      value: 'New Name',
    });
    expect(result.name).toBe('New Name');
    // Other fields unchanged
    expect(result.major).toBe(EMPTY_PROFILE.major);
  });

  it('UPDATE_PROFILE_FIELD does not mutate original state', () => {
    const original = { ...EMPTY_PROFILE };
    profileReducer(EMPTY_PROFILE, { type: 'UPDATE_PROFILE_FIELD', field: 'name', value: 'x' });
    expect(EMPTY_PROFILE.name).toBe(original.name);
  });

  // ─── ADD_COMPLETED_COURSE ──────────────────────────────────────────────────
  it('ADD_COMPLETED_COURSE appends to completed_courses', () => {
    const result = profileReducer(EMPTY_PROFILE, {
      type: 'ADD_COMPLETED_COURSE',
      course: DEMO_COMPLETED,
    });
    expect(result.completed_courses).toHaveLength(1);
    expect(result.completed_courses[0].course).toBe('ECE 302');
  });

  it('ADD_COMPLETED_COURSE does not mutate original array', () => {
    const state = { ...EMPTY_PROFILE, completed_courses: [] };
    profileReducer(state, { type: 'ADD_COMPLETED_COURSE', course: DEMO_COMPLETED });
    expect(state.completed_courses).toHaveLength(0);
  });

  // ─── UPDATE_COMPLETED_COURSE ───────────────────────────────────────────────
  it('UPDATE_COMPLETED_COURSE replaces course at index', () => {
    const startState = { ...EMPTY_PROFILE, completed_courses: [DEMO_COMPLETED] };
    const updated = { ...DEMO_COMPLETED, grade: 'B+' };
    const result = profileReducer(startState, {
      type: 'UPDATE_COMPLETED_COURSE',
      index: 0,
      course: updated,
    });
    expect(result.completed_courses[0].grade).toBe('B+');
  });

  // ─── REMOVE_COMPLETED_COURSE ──────────────────────────────────────────────
  it('REMOVE_COMPLETED_COURSE removes course at index', () => {
    const second = { ...DEMO_COMPLETED, course: 'ECE 306' };
    const startState = { ...EMPTY_PROFILE, completed_courses: [DEMO_COMPLETED, second] };
    const result = profileReducer(startState, { type: 'REMOVE_COMPLETED_COURSE', index: 0 });
    expect(result.completed_courses).toHaveLength(1);
    expect(result.completed_courses[0].course).toBe('ECE 306');
  });

  // ─── ADD_INPROGRESS_COURSE ─────────────────────────────────────────────────
  it('ADD_INPROGRESS_COURSE appends to in_progress_courses', () => {
    const result = profileReducer(EMPTY_PROFILE, {
      type: 'ADD_INPROGRESS_COURSE',
      course: DEMO_INPROGRESS,
    });
    expect(result.in_progress_courses).toHaveLength(1);
    expect(result.in_progress_courses[0].course).toBe('ECE 312H');
  });

  // ─── UPDATE_INPROGRESS_COURSE ──────────────────────────────────────────────
  it('UPDATE_INPROGRESS_COURSE replaces course at index', () => {
    const startState = { ...EMPTY_PROFILE, in_progress_courses: [DEMO_INPROGRESS] };
    const updated = { ...DEMO_INPROGRESS, credit_hours: 4 };
    const result = profileReducer(startState, {
      type: 'UPDATE_INPROGRESS_COURSE',
      index: 0,
      course: updated,
    });
    expect(result.in_progress_courses[0].credit_hours).toBe(4);
  });

  // ─── REMOVE_INPROGRESS_COURSE ─────────────────────────────────────────────
  it('REMOVE_INPROGRESS_COURSE removes course at index', () => {
    const second = { ...DEMO_INPROGRESS, course: 'M 325K' };
    const startState = { ...EMPTY_PROFILE, in_progress_courses: [DEMO_INPROGRESS, second] };
    const result = profileReducer(startState, { type: 'REMOVE_INPROGRESS_COURSE', index: 1 });
    expect(result.in_progress_courses).toHaveLength(1);
    expect(result.in_progress_courses[0].course).toBe('ECE 312H');
  });

  // ─── LOAD_DEMO ────────────────────────────────────────────────────────────
  it('LOAD_DEMO replaces profile with the demo payload', () => {
    const result = profileReducer(EMPTY_PROFILE, {
      type: 'LOAD_DEMO',
      profile: DEMO_PROFILE,
    });
    expect(result.name).toBe('Example Student');
    expect(result.completed_courses).toHaveLength(1);
  });

  // ─── CLEAR_PROFILE ────────────────────────────────────────────────────────
  it('CLEAR_PROFILE resets to EMPTY_PROFILE', () => {
    const result = profileReducer(DEMO_PROFILE, { type: 'CLEAR_PROFILE' });
    expect(result.name).toBe('');
    expect(result.eid).toBe('');
    expect(result.completed_courses).toHaveLength(0);
    expect(result.in_progress_courses).toHaveLength(0);
  });

  it('CLEAR_PROFILE result equals EMPTY_PROFILE', () => {
    const result = profileReducer(DEMO_PROFILE, { type: 'CLEAR_PROFILE' });
    expect(result).toEqual(EMPTY_PROFILE);
  });
});

describe('EMPTY_PROFILE shape', () => {
  it('has empty completed_courses and in_progress_courses arrays', () => {
    expect(EMPTY_PROFILE.completed_courses).toEqual([]);
    expect(EMPTY_PROFILE.in_progress_courses).toEqual([]);
  });

  it('has ece-bse major and 2024 catalog year', () => {
    expect(EMPTY_PROFILE.major).toBe('ece-bse');
    expect(EMPTY_PROFILE.catalog_year).toBe('2024');
  });

  it('has zeroed GPA and credit summary', () => {
    expect(EMPTY_PROFILE.gpa.cumulative).toBe(0);
    expect(EMPTY_PROFILE.credit_summary.total_hours).toBe(0);
  });
});
