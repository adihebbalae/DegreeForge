import { describe, it, expect } from 'vitest';
import {
  hasInstructorColumn,
  computeGpaFromDistribution,
  aggregateSectionDistributions,
  buildByInstructor,
  GPA_POINTS,
} from './grade-dist-parser';
import type { GradeDistribution } from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeCourseDist(overrides: Partial<GradeDistribution> = {}): GradeDistribution {
  return {
    department: 'Electrical And Computer Engineering',
    department_code: 'ECE',
    course_number: '302',
    course_title: 'INTRO ELECTRICAL ENGINEERING',
    sections: [
      {
        semester: 'Fall 2025',
        section: 18155,
        grades: { 'A+': 0, A: 20, 'A-': 10, 'B+': 8, B: 7, 'B-': 2, 'C+': 1, C: 1, 'C-': 0, 'D+': 0, D: 0, 'D-': 0, F: 1, Other: 2 },
        a_pct: 57.7,
        b_pct: 32.7,
        c_pct: 3.8,
        d_pct: 0,
        f_pct: 1.9,
        enrollment: 52,
        gpa: 3.5,
      },
      {
        semester: 'Fall 2024',
        section: 17200,
        grades: { 'A+': 0, A: 10, 'A-': 5, 'B+': 4, B: 3, 'B-': 1, 'C+': 0, C: 0, 'C-': 0, 'D+': 0, D: 0, 'D-': 0, F: 0, Other: 1 },
        a_pct: 62.5,
        b_pct: 33.3,
        c_pct: 0,
        d_pct: 0,
        f_pct: 0,
        enrollment: 24,
        gpa: 3.65,
      },
    ],
    avg_gpa: 3.55,
    a_pct: 59.2,
    b_pct: 32.9,
    c_pct: 2.6,
    d_pct: 0,
    f_pct: 1.3,
    total_enrollment: 76,
    total_sections: 2,
    byInstructor: {},
    ...overrides,
  };
}

// ─── hasInstructorColumn ──────────────────────────────────────────────────────

describe('hasInstructorColumn', () => {
  it('returns false for UTGradesPlus 2021-2026 CSV headers (no instructor column)', () => {
    const headers = [
      'Semester',
      'Section Number',
      'Course Prefix',
      'Course Number',
      'Course Title',
      'Course',
      'Letter Grade',
      'Count of letter grade',
      'Department/Program',
    ];
    expect(hasInstructorColumn(headers)).toBe(false);
  });

  it('returns true when "Instructor" column is present', () => {
    expect(hasInstructorColumn(['Semester', 'Instructor', 'Grade'])).toBe(true);
  });

  it('returns true for "Professor Name" column (case-insensitive)', () => {
    expect(hasInstructorColumn(['Semester', 'professor name', 'Grade'])).toBe(true);
  });

  it('returns true for "Professor" column', () => {
    expect(hasInstructorColumn(['Semester', 'Professor', 'Grade'])).toBe(true);
  });

  it('returns true for "Instructor Name" column', () => {
    expect(hasInstructorColumn(['Semester', 'Instructor Name', 'Grade'])).toBe(true);
  });

  it('handles header trimming (leading/trailing spaces)', () => {
    expect(hasInstructorColumn(['  Instructor  '])).toBe(true);
  });

  it('returns false for empty header list', () => {
    expect(hasInstructorColumn([])).toBe(false);
  });
});

// ─── computeGpaFromDistribution ───────────────────────────────────────────────

describe('computeGpaFromDistribution', () => {
  it('computes GPA for all-A class (4.0)', () => {
    const dist = { A: 10, 'A+': 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, 'D+': 0, D: 0, 'D-': 0, F: 0, Other: 0 };
    expect(computeGpaFromDistribution(dist)).toBe(4.0);
  });

  it('excludes "Other" from GPA calculation', () => {
    const dist = { A: 10, Other: 5, F: 0, 'A+': 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, 'D+': 0, D: 0, 'D-': 0 };
    // Only A×10 count toward GPA
    expect(computeGpaFromDistribution(dist)).toBe(4.0);
  });

  it('returns 0 for empty distribution (no graded students)', () => {
    const dist = { A: 0, Other: 5, 'A+': 0, 'A-': 0, 'B+': 0, B: 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, 'D+': 0, D: 0, 'D-': 0, F: 0 };
    expect(computeGpaFromDistribution(dist)).toBe(0);
  });

  it('computes mixed GPA correctly (A=4, B=3 → 3.5 for 50/50 split)', () => {
    const dist = { A: 5, B: 5, 'A+': 0, 'A-': 0, 'B+': 0, 'B-': 0, 'C+': 0, C: 0, 'C-': 0, 'D+': 0, D: 0, 'D-': 0, F: 0, Other: 0 };
    expect(computeGpaFromDistribution(dist)).toBe(3.5);
  });

  it('uses correct GPA_POINTS for A- (3.67)', () => {
    expect(GPA_POINTS['A-']).toBe(3.67);
  });

  it('uses correct GPA_POINTS for B+ (3.33)', () => {
    expect(GPA_POINTS['B+']).toBe(3.33);
  });
});

// ─── aggregateSectionDistributions ───────────────────────────────────────────

describe('aggregateSectionDistributions', () => {
  it('sums grade counts across all sections', () => {
    const course = makeCourseDist();
    const agg = aggregateSectionDistributions(course);
    // Fall 2025: A=20, Fall 2024: A=10 → total A=30
    expect(agg['A']).toBe(30);
    // Fall 2025: F=1, Fall 2024: F=0 → total F=1
    expect(agg['F']).toBe(1);
    // Other: 2+1=3
    expect(agg['Other']).toBe(3);
  });

  it('includes all GRADE_LETTERS as keys', () => {
    const course = makeCourseDist();
    const agg = aggregateSectionDistributions(course);
    for (const letter of ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'Other']) {
      expect(agg).toHaveProperty(letter);
    }
  });

  it('returns zero for all grades when sections array is empty', () => {
    const course = makeCourseDist({ sections: [] });
    const agg = aggregateSectionDistributions(course);
    expect(agg['A']).toBe(0);
    expect(agg['F']).toBe(0);
  });
});

// ─── buildByInstructor ────────────────────────────────────────────────────────

describe('buildByInstructor', () => {
  it('returns {} when no instructors provided', () => {
    const course = makeCourseDist();
    expect(buildByInstructor(course, [])).toEqual({});
  });

  it('creates one entry per unique instructor', () => {
    const course = makeCourseDist();
    const result = buildByInstructor(course, ['Nina K Telang', 'Shyam Shankar']);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result).toHaveProperty('Nina K Telang');
    expect(result).toHaveProperty('Shyam Shankar');
  });

  it('buckets blank instructor name as "Unknown"', () => {
    const course = makeCourseDist();
    const result = buildByInstructor(course, ['']);
    expect(result).toHaveProperty('Unknown');
  });

  it('buckets whitespace-only instructor name as "Unknown"', () => {
    const course = makeCourseDist();
    const result = buildByInstructor(course, ['   ']);
    expect(result).toHaveProperty('Unknown');
  });

  it('counts multiple sections for the same instructor', () => {
    const course = makeCourseDist();
    // 2 sections for Telang, 1 for Shankar → ratios 2/3 and 1/3
    const result = buildByInstructor(course, [
      'Nina K Telang',
      'Nina K Telang',
      'Shyam Shankar',
    ]);
    expect(Object.keys(result)).toHaveLength(2);
    // Telang gets ~2/3 of 76 = 51; Shankar gets ~1/3 of 76 = 25
    expect(result['Nina K Telang'].total_enrollment).toBe(Math.round(76 * (2 / 3)));
    expect(result['Shyam Shankar'].total_enrollment).toBe(Math.round(76 * (1 / 3)));
  });

  it('uses course avg_gpa for all instructors (estimated)', () => {
    const course = makeCourseDist();
    const result = buildByInstructor(course, ['Nina K Telang', 'Shyam Shankar']);
    expect(result['Nina K Telang'].avg_gpa).toBe(3.55);
    expect(result['Shyam Shankar'].avg_gpa).toBe(3.55);
  });

  it('distribution keys include all standard grade letters', () => {
    const course = makeCourseDist();
    const result = buildByInstructor(course, ['Nina K Telang']);
    const dist = result['Nina K Telang'].distribution;
    for (const letter of ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F', 'Other']) {
      expect(dist).toHaveProperty(letter);
    }
  });

  it('total_enrollment across all instructors roughly equals course total', () => {
    const course = makeCourseDist();
    const result = buildByInstructor(course, ['A', 'B', 'C']);
    const total = Object.values(result).reduce((s, v) => s + v.total_enrollment, 0);
    // Rounding may cause off-by-1 per instructor; allow ±3 difference
    expect(Math.abs(total - course.total_enrollment)).toBeLessThanOrEqual(3);
  });
});
