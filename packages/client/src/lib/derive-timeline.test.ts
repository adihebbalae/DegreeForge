import { describe, it, expect } from 'vitest';
import { deriveTimelinePlanFromProfile } from './derive-timeline';
import type { Semester, UserProfile } from '../types';

const SEMESTERS: Semester[] = [
  { id: 'Fall 2025',   label: "Fall '25", status: 'past',    year: 2025, season: 'Fall'   },
  { id: 'Spring 2026', label: "Sp '26",   status: 'current', year: 2026, season: 'Spring' },
  { id: 'Fall 2026',   label: "Fall '26", status: 'future',  year: 2026, season: 'Fall'   },
  { id: 'Spring 2027', label: "Sp '27",   status: 'future',  year: 2027, season: 'Spring' },
];

function makeProfile(overrides: Partial<UserProfile>): UserProfile {
  return {
    name: '',
    eid: '',
    university: 'UT',
    catalog_year: '2024',
    major: 'ece-bse',
    classification: '',
    first_semester: '',
    graduation_target: '',
    tech_core: { declared: '', status: '', required_math: '', required_ece: [], tech_electives_needed: 0 },
    secondary_aspirations: {
      math_ba: { status: '', notes: '' },
      advanced_math_cert: { status: '', notes: '' },
      jefferson_scholars_cert: { status: '', notes: '' },
    },
    preferences: { course_load: '', course_load_tolerance: 'above_average', time_preference: 'no_preference', summer_courses: false, summer_notes: '' },
    gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
    credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
    completed_courses: [],
    in_progress_courses: [],
    career_interests: [],
    notes: '',
    ...overrides,
  };
}

describe('deriveTimelinePlanFromProfile', () => {
  it('returns an entry for every semester initialized to empty', () => {
    const plan = deriveTimelinePlanFromProfile(makeProfile({}), SEMESTERS);
    expect(Object.keys(plan)).toHaveLength(SEMESTERS.length);
    for (const sem of SEMESTERS) {
      expect(plan[sem.id]).toBeDefined();
    }
  });

  it('places a completed course with matching past semester into that semester', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    expect(plan['Fall 2025']).toContain('ECE 302');
    expect(plan['Spring 2026']).not.toContain('ECE 302');
    expect(plan['Fall 2026']).not.toContain('ECE 302');
  });

  it('places an in-residence completed course with unknown semester into the earliest past semester', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'M 408C', title: 'Calc', grade: 'B', semester: 'Summer 2023', type: 'In residence', credit_hours: 4 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    // Summer 2023 is not in SEMESTERS, so falls back to earliest past = Fall 2025
    expect(plan['Fall 2025']).toContain('M 408C');
  });

  it('excludes AP credit from the planner grid (source field)', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'M 408C', title: 'Calc', grade: 'CR', semester: 'Summer 2023', type: 'Exam', credit_hours: 4, source: 'ap' },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    for (const sem of SEMESTERS) {
      expect(plan[sem.id]).not.toContain('M 408C');
    }
  });

  it('excludes transfer credit from the planner grid (source field)', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'RHE 306', title: 'Rhetoric', grade: 'CR', semester: 'Spring 2024', type: 'Transfer', credit_hours: 3, source: 'transfer' },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    for (const sem of SEMESTERS) {
      expect(plan[sem.id]).not.toContain('RHE 306');
    }
  });

  it('excludes credit_by_exam from the planner grid (source field)', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'ECE 302', title: 'Intro EE', grade: 'CR', semester: 'Fall 2025', type: 'Credit by exam', credit_hours: 3, source: 'credit_by_exam' },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    for (const sem of SEMESTERS) {
      expect(plan[sem.id]).not.toContain('ECE 302');
    }
  });

  it('excludes non-residence courses detected via type field (no source field)', () => {
    // Demo profile uses type="Transfer"/"AP"/"Credit by exam" without a source field.
    const profile = makeProfile({
      completed_courses: [
        { course: 'M 408C', title: 'Calc', grade: 'CR', semester: 'Fall 2023', type: 'Transfer', credit_hours: 4 },
        { course: 'PHY 303K', title: 'Physics', grade: 'CR', semester: 'Fall 2023', type: 'AP', credit_hours: 3 },
        { course: 'RHE 306', title: 'Rhetoric', grade: 'CR', semester: 'Fall 2023', type: 'Credit by exam', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    for (const sem of SEMESTERS) {
      expect(plan[sem.id]).not.toContain('M 408C');
      expect(plan[sem.id]).not.toContain('PHY 303K');
      expect(plan[sem.id]).not.toContain('RHE 306');
    }
  });

  it('places an in-residence course normally while excluding non-residence in the same profile', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
        { course: 'M 408C', title: 'Calc', grade: 'CR', semester: 'Spring 2023', type: 'AP', credit_hours: 4, source: 'ap' },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    expect(plan['Fall 2025']).toContain('ECE 302');
    for (const sem of SEMESTERS) {
      expect(plan[sem.id]).not.toContain('M 408C');
    }
  });

  it('places an in-progress course with matching current semester into that semester', () => {
    const profile = makeProfile({
      in_progress_courses: [
        { course: 'ECE 312H', title: 'Software I', semester: 'Spring 2026', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    expect(plan['Spring 2026']).toContain('ECE 312H');
    expect(plan['Fall 2025']).not.toContain('ECE 312H');
    expect(plan['Fall 2026']).not.toContain('ECE 312H');
  });

  it('places an in-progress course into its explicit semester when that semester is now past (date drift)', () => {
    // Simulates real time advancing: a profile lists a course in-progress for "Spring 2026",
    // but the viewing date has moved on so "Spring 2026" is now past and "Summer 2026" is current.
    // The course must stay in Spring 2026 (its explicit term), NOT pile into Summer 2026.
    const driftedSemesters: Semester[] = [
      { id: 'Fall 2025',   label: "Fall '25", status: 'past',    year: 2025, season: 'Fall'   },
      { id: 'Spring 2026', label: "Sp '26",   status: 'past',    year: 2026, season: 'Spring' },
      { id: 'Summer 2026', label: "Su '26",   status: 'current', year: 2026, season: 'Summer' },
      { id: 'Fall 2026',   label: "Fall '26", status: 'future',  year: 2026, season: 'Fall'   },
    ];
    const profile = makeProfile({
      in_progress_courses: [
        { course: 'ECE 312H', title: 'Software I', semester: 'Spring 2026', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, driftedSemesters);
    expect(plan['Spring 2026']).toContain('ECE 312H');
    expect(plan['Summer 2026']).not.toContain('ECE 312H');
  });

  it('places an in-progress course with non-current semester into the first current semester', () => {
    const profile = makeProfile({
      in_progress_courses: [
        { course: 'ECE 319H', title: 'Embedded', semester: 'Summer 2099', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    // Summer 2099 is not current, falls back to first current = Spring 2026
    expect(plan['Spring 2026']).toContain('ECE 319H');
  });

  it('future semesters remain empty', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
      ],
      in_progress_courses: [
        { course: 'ECE 312H', title: 'Software I', semester: 'Spring 2026', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    expect(plan['Fall 2026']).toHaveLength(0);
    expect(plan['Spring 2027']).toHaveLength(0);
  });

  it('deduplicates courses within the same semester if profile has duplicates', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
        { course: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    expect(plan['Fall 2025'].filter((c) => c === 'ECE 302')).toHaveLength(1);
  });

  it('handles empty profile (no courses) without errors', () => {
    const plan = deriveTimelinePlanFromProfile(makeProfile({}), SEMESTERS);
    for (const sem of SEMESTERS) {
      expect(plan[sem.id]).toHaveLength(0);
    }
  });

  it('demo profile (Adi) produces correct placement', () => {
    const profile = makeProfile({
      completed_courses: [
        { course: 'ECE 302', title: 'Intro', grade: 'B+', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
        { course: 'ECE 306', title: 'Comp',  grade: 'A-', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
      ],
      in_progress_courses: [
        { course: 'ECE 312H', title: 'SW I',  semester: 'Spring 2026', credit_hours: 3 },
        { course: 'M 325K',   title: 'Disc M', semester: 'Spring 2026', credit_hours: 3 },
      ],
    });
    const plan = deriveTimelinePlanFromProfile(profile, SEMESTERS);
    expect(plan['Fall 2025']).toContain('ECE 302');
    expect(plan['Fall 2025']).toContain('ECE 306');
    expect(plan['Spring 2026']).toContain('ECE 312H');
    expect(plan['Spring 2026']).toContain('M 325K');
    expect(plan['Fall 2026']).toHaveLength(0);
  });
});
