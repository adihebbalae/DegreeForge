import { describe, it, expect } from 'vitest';
import {
  normalizeEEtoECE,
  normalizeDeptCode,
  normalizeGradeDistributions,
} from './normalize';
import type { GradeDistribution } from '../types';

describe('normalizeEEtoECE', () => {
  it('normalizes "E E 302" → "ECE 302"', () => {
    expect(normalizeEEtoECE('E E 302')).toBe('ECE 302');
  });

  it('normalizes "E E302" → "ECE 302"', () => {
    expect(normalizeEEtoECE('E E302')).toBe('ECE 302');
  });

  it('leaves "ECE 302" unchanged', () => {
    expect(normalizeEEtoECE('ECE 302')).toBe('ECE 302');
  });

  it('leaves "M 340L" unchanged', () => {
    expect(normalizeEEtoECE('M 340L')).toBe('M 340L');
  });

  it('handles lowercase "e e 302"', () => {
    expect(normalizeEEtoECE('e e 302')).toBe('ECE 302');
  });

  it('handles lowercase "e e302"', () => {
    expect(normalizeEEtoECE('e e302')).toBe('ECE 302');
  });

  it('handles mixed-case "E e 419K"', () => {
    expect(normalizeEEtoECE('E e 419K')).toBe('ECE 419K');
  });

  it('leaves "PHY 303K" unchanged', () => {
    expect(normalizeEEtoECE('PHY 303K')).toBe('PHY 303K');
  });

  it('normalizes multi-digit courses "E E 312"', () => {
    expect(normalizeEEtoECE('E E 312')).toBe('ECE 312');
  });

  it('normalizes alphanumeric courses "E E 351M"', () => {
    expect(normalizeEEtoECE('E E 351M')).toBe('ECE 351M');
  });
});

describe('normalizeDeptCode', () => {
  it('converts "E E" to "ECE"', () => {
    expect(normalizeDeptCode('E E')).toBe('ECE');
  });

  it('leaves "ECE" unchanged', () => {
    expect(normalizeDeptCode('ECE')).toBe('ECE');
  });

  it('handles lowercase "e e"', () => {
    expect(normalizeDeptCode('e e')).toBe('ECE');
  });

  it('leaves unrelated codes unchanged', () => {
    expect(normalizeDeptCode('M')).toBe('M');
    expect(normalizeDeptCode('PHY')).toBe('PHY');
  });
});

describe('normalizeGradeDistributions', () => {
  const mockSection = {
    semester: 'Fall 2021',
    section: 17430,
    grades: { A: 10, B: 5, F: 1 },
    a_pct: 62.5,
    b_pct: 31.25,
    c_pct: 0,
    d_pct: 0,
    f_pct: 6.25,
    enrollment: 16,
    gpa: 3.2,
  };

  const mockEEDist: GradeDistribution = {
    department: 'Electrical Engineering',
    department_code: 'E E',
    course_number: '302',
    course_title: 'INTRO ELECTRICAL ENGINEERING',
    sections: [mockSection],
    avg_gpa: 3.2,
    a_pct: 62.5,
    b_pct: 31.25,
    c_pct: 0,
    d_pct: 0,
    f_pct: 6.25,
    total_enrollment: 16,
    total_sections: 1,
  };

  const mockECEDist: GradeDistribution = {
    department: 'Electrical And Computer Engineering',
    department_code: 'ECE',
    course_number: '380L',
    course_title: 'DATA MINING',
    sections: [mockSection],
    avg_gpa: 3.555,
    a_pct: 63.6,
    b_pct: 30.3,
    c_pct: 0,
    d_pct: 0,
    f_pct: 1.5,
    total_enrollment: 66,
    total_sections: 3,
  };

  it('renames "E E 302" key to "ECE 302"', () => {
    const raw = { courses: { 'E E 302': mockEEDist } };
    const result = normalizeGradeDistributions(raw);
    expect('ECE 302' in result).toBe(true);
    expect('E E 302' in result).toBe(false);
  });

  it('normalizes department_code from "E E" to "ECE"', () => {
    const raw = { courses: { 'E E 302': mockEEDist } };
    const result = normalizeGradeDistributions(raw);
    expect(result['ECE 302'].department_code).toBe('ECE');
  });

  it('preserves already-normalized ECE entries unchanged', () => {
    const raw = { courses: { 'ECE 380L': mockECEDist } };
    const result = normalizeGradeDistributions(raw);
    expect('ECE 380L' in result).toBe(true);
    expect(result['ECE 380L'].department_code).toBe('ECE');
  });

  it('handles mixed old and new entries in the same file', () => {
    const raw = {
      courses: {
        'E E 302': mockEEDist,
        'ECE 380L': mockECEDist,
      },
    };
    const result = normalizeGradeDistributions(raw);
    expect(Object.keys(result).sort()).toEqual(['ECE 302', 'ECE 380L']);
    expect(result['ECE 302'].department_code).toBe('ECE');
    expect(result['ECE 380L'].department_code).toBe('ECE');
  });

  it('preserves all other fields after normalization', () => {
    const raw = { courses: { 'E E 302': mockEEDist } };
    const result = normalizeGradeDistributions(raw);
    const normalized = result['ECE 302'];
    expect(normalized.course_number).toBe('302');
    expect(normalized.avg_gpa).toBe(3.2);
    expect(normalized.sections).toHaveLength(1);
    expect(normalized.total_enrollment).toBe(16);
  });
});
