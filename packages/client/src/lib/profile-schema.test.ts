import { describe, it, expect } from 'vitest';
import { parseProfileState } from './profile-schema';

const validProfile = {
  name: 'Test Student',
  eid: 'ts12345',
  university: 'The University of Texas at Austin',
  catalog_year: '2024',
  major: 'ece-bse',
  classification: 'Freshman',
  first_semester: 'Fall 2025',
  graduation_target: 'Spring 2029',
  tech_core: {
    declared: 'computer_architecture',
    status: 'intended',
    required_math: 'M 325K',
    required_ece: ['ECE 316', 'ECE 460N'],
    tech_electives_needed: 3,
  },
  secondary_aspirations: {
    math_ba: { status: 'considering', notes: '' },
    advanced_math_cert: { status: 'not_pursuing', notes: '' },
    jefferson_scholars_cert: { status: 'not_pursuing', notes: '' },
  },
  preferences: {
    course_load: '17-18 hours',
    course_load_tolerance: 'above_average',
    time_preference: 'no_preference',
    summer_courses: false,
    summer_notes: '',
  },
  gpa: {
    cumulative: 3.5,
    lower_division: 3.5,
    upper_division: 0,
    gpa_hours: 12,
    grade_points: 42,
  },
  credit_summary: {
    total_hours_transferred: 0,
    total_hours_taken: 12,
    total_hours: 12,
  },
  completed_courses: [
    { course: 'ECE 302', title: 'Intro to EE', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
  ],
  in_progress_courses: [
    { course: 'ECE 312H', title: 'Software I Honors', semester: 'Spring 2026', credit_hours: 3 },
  ],
  career_interests: ['hardware'],
  notes: '',
};

describe('parseProfileState', () => {
  it('returns intact object for a valid full profile', () => {
    const result = parseProfileState(validProfile);
    expect(result).not.toBeNull();
    expect(result?.name).toBe('Test Student');
    expect(result?.eid).toBe('ts12345');
    expect(result?.major).toBe('ece-bse');
    expect(result?.completed_courses).toHaveLength(1);
    expect(result?.completed_courses[0].course).toBe('ECE 302');
    expect(result?.in_progress_courses).toHaveLength(1);
  });

  it('applies defaults for a minimal valid input (only required top-level fields)', () => {
    const minimal = {
      name: '',
      eid: '',
      university: 'UT',
      catalog_year: '2024',
      major: 'ece-bse',
      classification: '',
      first_semester: '',
      graduation_target: '',
      // Omit all optional nested — should get defaults
    };
    const result = parseProfileState(minimal);
    expect(result).not.toBeNull();
    expect(result?.completed_courses).toEqual([]);
    expect(result?.in_progress_courses).toEqual([]);
    expect(result?.career_interests).toEqual([]);
    expect(result?.gpa.cumulative).toBe(0);
    expect(result?.credit_summary.total_hours).toBe(0);
    expect(result?.tech_core.required_ece).toEqual([]);
  });

  it('returns null for null input', () => {
    expect(parseProfileState(null)).toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseProfileState('string')).toBeNull();
    expect(parseProfileState(42)).toBeNull();
  });

  it('returns null when completed_courses contains a non-object element', () => {
    const bad = { ...validProfile, completed_courses: [null] };
    expect(parseProfileState(bad)).toBeNull();
  });

  // Theme B: a structurally-valid element with an invalid course CODE is dropped
  // (tolerant), not rejected — one junk id must not wipe the whole profile.
  it('drops a completed_course whose course id is not a valid code, keeps valid ones', () => {
    const mixed = {
      ...validProfile,
      completed_courses: [
        validProfile.completed_courses[0],
        { course: 'JUNK', title: 'Section header', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
      ],
    };
    const result = parseProfileState(mixed);
    expect(result).not.toBeNull();
    expect(result?.completed_courses).toHaveLength(1);
    expect(result?.completed_courses[0].course).toBe('ECE 302');
  });

  it('drops an in_progress_course whose course id is not a valid code', () => {
    const mixed = {
      ...validProfile,
      in_progress_courses: [
        validProfile.in_progress_courses[0],
        { course: 'NEEDS REVIEW', title: 'x', semester: 'Spring 2026', credit_hours: 3 },
      ],
    };
    const result = parseProfileState(mixed);
    expect(result?.in_progress_courses).toHaveLength(1);
    expect(result?.in_progress_courses[0].course).toBe('ECE 312H');
  });

  it('falls back to default empty array for missing completed_courses', () => {
    const noCompletedCourses = { ...validProfile, completed_courses: undefined };
    const result = parseProfileState(noCompletedCourses);
    expect(result).not.toBeNull();
    expect(result?.completed_courses).toEqual([]);
  });

  it('preserves notes field when present', () => {
    const withNotes = { ...validProfile, notes: 'Some notes here' };
    const result = parseProfileState(withNotes);
    expect(result).not.toBeNull();
    expect(result?.notes).toBe('Some notes here');
  });

  it('backfills notes to empty string when absent', () => {
    const noNotes = { ...validProfile };
    delete (noNotes as Partial<typeof validProfile>).notes;
    const result = parseProfileState(noNotes);
    expect(result).not.toBeNull();
    expect(result?.notes).toBe('');
  });

  it('returns null when an empty object is provided (missing required structure)', () => {
    // Empty object lacks required fields — schema provides defaults for most,
    // but name/eid/etc are required strings with defaults so it should succeed
    const result = parseProfileState({});
    expect(result).not.toBeNull();
    expect(result?.name).toBe('');
    expect(result?.major).toBe('ece-bse');
    expect(result?.catalog_year).toBe('2024');
  });

  // ─── Numeric bounds ──────────────────────────────────────────────────────────

  it('rejects a GPA > 4 (out-of-range cumulative falls back to null safeParse)', () => {
    const bad = { ...validProfile, gpa: { ...validProfile.gpa, cumulative: 5.0 } };
    // Out-of-range value → safeParse fails → parseProfileState returns null.
    expect(parseProfileState(bad)).toBeNull();
  });

  it('rejects a negative GPA', () => {
    const bad = { ...validProfile, gpa: { ...validProfile.gpa, lower_division: -1 } };
    expect(parseProfileState(bad)).toBeNull();
  });

  it('rejects a course credit_hours > 18', () => {
    const bad = {
      ...validProfile,
      completed_courses: [{ ...validProfile.completed_courses[0], credit_hours: 20 }],
    };
    expect(parseProfileState(bad)).toBeNull();
  });

  it('rejects a negative course credit_hours', () => {
    const bad = {
      ...validProfile,
      completed_courses: [{ ...validProfile.completed_courses[0], credit_hours: -1 }],
    };
    expect(parseProfileState(bad)).toBeNull();
  });

  it('accepts GPA at boundary values (0 and 4)', () => {
    const boundary = {
      ...validProfile,
      gpa: { cumulative: 0, lower_division: 4, upper_division: 4, gpa_hours: 0, grade_points: 0 },
    };
    const result = parseProfileState(boundary);
    expect(result).not.toBeNull();
    expect(result?.gpa.cumulative).toBe(0);
    expect(result?.gpa.lower_division).toBe(4);
  });

  it('accepts course credit_hours at boundary values (0 and 18)', () => {
    const boundary = {
      ...validProfile,
      completed_courses: [{ ...validProfile.completed_courses[0], credit_hours: 18 }],
      in_progress_courses: [{ ...validProfile.in_progress_courses[0], credit_hours: 0 }],
    };
    const result = parseProfileState(boundary);
    expect(result).not.toBeNull();
    expect(result?.completed_courses[0].credit_hours).toBe(18);
  });
});
