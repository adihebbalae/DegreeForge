/**
 * Tests for computeUtGpa — UT GPA computation rules.
 *
 * Covers:
 *  1. Mixed-source profile: transfer/AP/credit_by_exam excluded
 *  2. Non-letter grades excluded (CR, NC, W, Q, IP, blank)
 *  3. Plus/minus scale accuracy
 *  4. Repeated course counts twice (no dedup)
 *  5. Empty / all-excluded → gpa=null
 *  6. Hand-verified multi-course example
 */

import { describe, it, expect } from 'vitest';
import { computeUtGpa, UT_GRADE_POINTS } from './gpa';
import type { UserProfile } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type CompletedCourse = UserProfile['completed_courses'][number];

function course(overrides: Partial<CompletedCourse>): CompletedCourse {
  return {
    course: 'ECE 302',
    title: 'Test Course',
    grade: 'A',
    semester: 'Fall 2024',
    type: '',
    credit_hours: 3,
    ...overrides,
  };
}

// ─── Scale sanity ─────────────────────────────────────────────────────────────

describe('UT_GRADE_POINTS scale', () => {
  it('has 12 entries (A through F, no A+)', () => {
    // A A- B+ B B- C+ C C- D+ D D- F
    expect(Object.keys(UT_GRADE_POINTS).length).toBe(12);
    expect('A+' in UT_GRADE_POINTS).toBe(false);
    expect(UT_GRADE_POINTS['A']).toBe(4.0);
    expect(UT_GRADE_POINTS['F']).toBe(0.0);
  });

  it('A- is 3.67, B+ is 3.33, D- is 0.67', () => {
    expect(UT_GRADE_POINTS['A-']).toBe(3.67);
    expect(UT_GRADE_POINTS['B+']).toBe(3.33);
    expect(UT_GRADE_POINTS['D-']).toBe(0.67);
  });
});

// ─── Source exclusion ─────────────────────────────────────────────────────────

describe('computeUtGpa — source exclusion', () => {
  it('excludes transfer source', () => {
    const result = computeUtGpa([
      course({ source: 'transfer', grade: 'B', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBeNull();
    expect(result.includedCount).toBe(0);
  });

  it('excludes ap source', () => {
    const result = computeUtGpa([
      course({ source: 'ap', grade: 'A', credit_hours: 4 }),
    ]);
    expect(result.gpa).toBeNull();
  });

  it('excludes credit_by_exam source', () => {
    const result = computeUtGpa([
      course({ source: 'credit_by_exam', grade: 'A', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBeNull();
  });

  it('includes in_residence source', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'A', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBe(4.0);
    expect(result.includedCount).toBe(1);
  });

  it('includes course with absent source (backward compat → in_residence)', () => {
    const c: CompletedCourse = { course: 'ECE 302', title: '', grade: 'B', semester: 'Fall 2024', type: '', credit_hours: 3 };
    const result = computeUtGpa([c]);
    expect(result.gpa).toBe(3.0);
    expect(result.includedCount).toBe(1);
  });

  it('excludes demo-profile Transfer type (source absent)', () => {
    const c: CompletedCourse = { course: 'M 408C', title: 'Calc I', grade: 'B', semester: '', type: 'Transfer', credit_hours: 4 };
    const result = computeUtGpa([c]);
    expect(result.gpa).toBeNull();
  });

  it('excludes demo-profile AP type', () => {
    const c: CompletedCourse = { course: 'M 408D', title: 'AP Calc', grade: 'CR', semester: '', type: 'AP', credit_hours: 4 };
    const result = computeUtGpa([c]);
    expect(result.gpa).toBeNull();
  });

  it('excludes demo-profile Credit by exam type', () => {
    const c: CompletedCourse = { course: 'RHE 306', title: 'Writing', grade: 'CR', semester: '', type: 'Credit by exam', credit_hours: 3 };
    const result = computeUtGpa([c]);
    expect(result.gpa).toBeNull();
  });

  it('mixed profile: only in_residence letter-graded courses count', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'A', credit_hours: 3 }),
      course({ course: 'M 408C', source: 'ap', grade: 'CR', credit_hours: 4 }),
      course({ course: 'ECE 306', source: 'transfer', grade: 'B', credit_hours: 3 }),
      course({ course: 'RHE 306', source: 'credit_by_exam', grade: 'CR', credit_hours: 3 }),
    ]);
    // Only the first course qualifies: 4.0 × 3 / 3 = 4.0
    expect(result.gpa).toBe(4.0);
    expect(result.gpaHours).toBe(3);
    expect(result.includedCount).toBe(1);
  });
});

// ─── Grade exclusions ─────────────────────────────────────────────────────────

describe('computeUtGpa — non-letter grade exclusion', () => {
  const excluded = ['CR', 'NC', 'Q', 'W', 'IP', '', 'P', 'I', 'X'];
  for (const grade of excluded) {
    it(`excludes grade "${grade}"`, () => {
      const result = computeUtGpa([
        course({ source: 'in_residence', grade, credit_hours: 3 }),
      ]);
      expect(result.gpa).toBeNull();
    });
  }

  it('excludes A+ (UT does not award A+ bonus — treat as not on scale)', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'A+', credit_hours: 3 }),
    ]);
    // A+ is not in UT_GRADE_POINTS, so it is excluded
    expect(result.gpa).toBeNull();
  });
});

// ─── Plus/minus scale precision ───────────────────────────────────────────────

describe('computeUtGpa — plus/minus scale', () => {
  it('A-: 3.67 × 3 / 3 = 3.67', () => {
    const result = computeUtGpa([course({ grade: 'A-', credit_hours: 3 })]);
    expect(result.gpa).toBe(3.67);
  });

  it('B+: 3.33 × 3 / 3 = 3.33', () => {
    const result = computeUtGpa([course({ grade: 'B+', credit_hours: 3 })]);
    expect(result.gpa).toBe(3.33);
  });

  it('D-: 0.67 × 3 / 3 = 0.67', () => {
    const result = computeUtGpa([course({ grade: 'D-', credit_hours: 3 })]);
    expect(result.gpa).toBe(0.67);
  });
});

// ─── Repeated course (no dedup) ───────────────────────────────────────────────

describe('computeUtGpa — repeated courses', () => {
  it('counts both attempts of the same course (no grade replacement)', () => {
    // First attempt: D (1.0 × 3 = 3.0 pts)
    // Repeat:        B (3.0 × 3 = 9.0 pts)
    // GPA = (3.0 + 9.0) / (3 + 3) = 12.0 / 6 = 2.0
    const result = computeUtGpa([
      course({ course: 'ECE 302', grade: 'D', credit_hours: 3 }),
      course({ course: 'ECE 302', grade: 'B', credit_hours: 3 }),
    ]);
    expect(result.includedCount).toBe(2);
    expect(result.gpaHours).toBe(6);
    expect(result.qualityPoints).toBeCloseTo(12.0);
    expect(result.gpa).toBe(2.0);
  });
});

// ─── Empty / all excluded ─────────────────────────────────────────────────────

describe('computeUtGpa — empty state', () => {
  it('returns gpa=null for empty array', () => {
    const result = computeUtGpa([]);
    expect(result.gpa).toBeNull();
    expect(result.gpaHours).toBe(0);
    expect(result.qualityPoints).toBe(0);
    expect(result.includedCount).toBe(0);
  });

  it('returns gpa=null when all courses are non-residence', () => {
    const result = computeUtGpa([
      course({ source: 'ap', grade: 'A', credit_hours: 3 }),
      course({ source: 'transfer', grade: 'B', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBeNull();
  });

  it('returns gpa=null when all in_residence courses have non-letter grades', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'CR', credit_hours: 3 }),
      course({ source: 'in_residence', grade: 'W', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBeNull();
  });
});

// ─── Lowercase / mixed-case grade normalisation (NIT 1) ─────────────────────

describe('computeUtGpa — grade case normalisation', () => {
  it('lowercase "a" is treated as "A" (4.0)', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'a', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBe(4.0);
    expect(result.includedCount).toBe(1);
  });

  it('lowercase "b+" is treated as "B+" (3.33)', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'b+', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBe(3.33);
    expect(result.includedCount).toBe(1);
  });

  it('mixed-case "A-" (unchanged) still works', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'A-', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBe(3.67);
  });

  it('leading/trailing whitespace is trimmed before normalisation', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: '  B  ', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBe(3.0);
    expect(result.includedCount).toBe(1);
  });
});

// ─── Prototype-key safety (NIT 2) ────────────────────────────────────────────

describe('computeUtGpa — prototype-key safety', () => {
  it('"constructor" grade is excluded (not treated as a valid letter grade)', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'constructor', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBeNull();
    expect(result.includedCount).toBe(0);
  });

  it('"toString" grade is excluded', () => {
    const result = computeUtGpa([
      course({ source: 'in_residence', grade: 'toString', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBeNull();
    expect(result.includedCount).toBe(0);
  });
});

// ─── Hand-verified multi-course example ──────────────────────────────────────

describe('computeUtGpa — multi-course hand-verified example', () => {
  it('computes correctly for a realistic 5-course semester', () => {
    // ECE 302:  A  × 3 = 4.00 × 3 = 12.00
    // ECE 306:  B+ × 3 = 3.33 × 3 =  9.99
    // M 427J:   A- × 4 = 3.67 × 4 = 14.68
    // RHE 306:  B  × 3 = 3.00 × 3 =  9.00
    // ECE 316:  C+ × 3 = 2.33 × 3 =  6.99
    // AP calc (excluded):
    // M 408C:  transfer, excluded
    //
    // Qualifying hours: 3+3+4+3+3 = 16
    // Quality points:   12.00+9.99+14.68+9.00+6.99 = 52.66
    // GPA = 52.66 / 16 = 3.29125 → rounded to 2 dec = 3.29
    const courses: CompletedCourse[] = [
      { course: 'ECE 302', title: '', grade: 'A',  semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'ECE 306', title: '', grade: 'B+', semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'M 427J',  title: '', grade: 'A-', semester: 'Fall 2024', type: '', credit_hours: 4, source: 'in_residence' },
      { course: 'RHE 306', title: '', grade: 'B',  semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'ECE 316', title: '', grade: 'C+', semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
      // Excluded:
      { course: 'M 408C',  title: '', grade: 'CR', semester: '', type: 'AP', credit_hours: 4 },
    ];
    const result = computeUtGpa(courses);

    expect(result.includedCount).toBe(5);
    expect(result.gpaHours).toBe(16);
    expect(result.qualityPoints).toBeCloseTo(52.66, 5);
    // 52.66 / 16 = 3.29125 → 3.29
    expect(result.gpa).toBe(3.29);
  });

  it('F grade is included and brings GPA down', () => {
    // A × 3 = 12.0, F × 3 = 0.0 → GPA = 12/(3+3) = 2.0
    const result = computeUtGpa([
      course({ grade: 'A', credit_hours: 3 }),
      course({ course: 'ECE 306', grade: 'F', credit_hours: 3 }),
    ]);
    expect(result.gpa).toBe(2.0);
    expect(result.includedCount).toBe(2);
  });
});
