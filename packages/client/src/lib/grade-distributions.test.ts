import { describe, it, expect } from 'vitest';
import {
  getCourseGradeStats,
  getAllCourseGradeStats,
  getDatasetCourseCount,
} from './grade-distributions';

// ─── ECE 411 ─────────────────────────────────────────────────────────────────
// Computer Architecture — one of the most-taken upper-division ECE courses.
// Expected stats derived from UTGradesPlus CSV exports, 2021-2026.

describe('getCourseGradeStats — ECE 411', () => {
  it('returns stats for ECE 411', () => {
    const stats = getCourseGradeStats('ECE 411');
    expect(stats).toBeDefined();
  });

  it('ECE 411: gpa_mean is ~3.0 (moderately difficult course)', () => {
    const stats = getCourseGradeStats('ECE 411')!;
    expect(stats.gpa_mean).toBeCloseTo(3.042, 2);
  });

  it('ECE 411: pct_a is ~39.9%', () => {
    const stats = getCourseGradeStats('ECE 411')!;
    expect(stats.pct_a).toBeCloseTo(39.9, 0);
  });

  it('ECE 411: pct_df is ~7.1% (D+/D/D-/F combined)', () => {
    const stats = getCourseGradeStats('ECE 411')!;
    expect(stats.pct_df).toBeCloseTo(7.1, 0);
  });

  it('ECE 411: withdrawal_rate is ~5.0%', () => {
    const stats = getCourseGradeStats('ECE 411')!;
    expect(stats.withdrawal_rate).toBeCloseTo(5.0, 0);
  });

  it('ECE 411: sample_size is 1332 students', () => {
    const stats = getCourseGradeStats('ECE 411')!;
    expect(stats.sample_size).toBe(1332);
  });

  it('ECE 411: term_range covers Fall 2022 through Spring 2025', () => {
    const stats = getCourseGradeStats('ECE 411')!;
    expect(stats.term_range).toMatch(/Fall 2022/);
    expect(stats.term_range).toMatch(/Spring 2025/);
  });
});

// ─── ECE 312 ─────────────────────────────────────────────────────────────────
// Object-Oriented Programming — core lower-division ECE course.

describe('getCourseGradeStats — ECE 312', () => {
  it('returns stats for ECE 312', () => {
    const stats = getCourseGradeStats('ECE 312');
    expect(stats).toBeDefined();
  });

  it('ECE 312: gpa_mean is ~2.84 (harder than ECE 411)', () => {
    const stats = getCourseGradeStats('ECE 312')!;
    expect(stats.gpa_mean).toBeCloseTo(2.841, 2);
  });

  it('ECE 312: pct_a is ~29.9%', () => {
    const stats = getCourseGradeStats('ECE 312')!;
    expect(stats.pct_a).toBeCloseTo(29.9, 0);
  });

  it('ECE 312: pct_df is ~8.8%', () => {
    const stats = getCourseGradeStats('ECE 312')!;
    expect(stats.pct_df).toBeCloseTo(8.8, 0);
  });

  it('ECE 312: withdrawal_rate is ~10.6%', () => {
    const stats = getCourseGradeStats('ECE 312')!;
    expect(stats.withdrawal_rate).toBeCloseTo(10.6, 0);
  });

  it('ECE 312: sample_size is 952 students', () => {
    const stats = getCourseGradeStats('ECE 312')!;
    expect(stats.sample_size).toBe(952);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('getCourseGradeStats — edge cases', () => {
  it('returns undefined for unknown course', () => {
    expect(getCourseGradeStats('ECE 999')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(getCourseGradeStats('')).toBeUndefined();
  });
});

// ─── Dataset integrity ────────────────────────────────────────────────────────

describe('getAllCourseGradeStats', () => {
  it('returns a non-empty record', () => {
    const all = getAllCourseGradeStats();
    expect(Object.keys(all).length).toBeGreaterThan(0);
  });

  it('all returned stats have required fields', () => {
    const all = getAllCourseGradeStats();
    for (const [, stats] of Object.entries(all)) {
      expect(stats).toHaveProperty('gpa_mean');
      expect(stats).toHaveProperty('pct_a');
      expect(stats).toHaveProperty('pct_df');
      expect(stats).toHaveProperty('withdrawal_rate');
      expect(stats).toHaveProperty('sample_size');
      expect(stats).toHaveProperty('term_range');
    }
  });

  it('gpa_mean values are in valid range [0, 4]', () => {
    const all = getAllCourseGradeStats();
    for (const [courseId, stats] of Object.entries(all)) {
      expect(stats.gpa_mean, `${courseId} gpa_mean out of range`).toBeGreaterThanOrEqual(0);
      expect(stats.gpa_mean, `${courseId} gpa_mean out of range`).toBeLessThanOrEqual(4);
    }
  });

  it('percentage values are in [0, 100]', () => {
    const all = getAllCourseGradeStats();
    for (const [courseId, stats] of Object.entries(all)) {
      expect(stats.pct_a, `${courseId} pct_a`).toBeGreaterThanOrEqual(0);
      expect(stats.pct_a, `${courseId} pct_a`).toBeLessThanOrEqual(100);
      expect(stats.pct_df, `${courseId} pct_df`).toBeGreaterThanOrEqual(0);
      expect(stats.withdrawal_rate, `${courseId} withdrawal_rate`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('getDatasetCourseCount', () => {
  it('returns a positive count', () => {
    expect(getDatasetCourseCount()).toBeGreaterThan(0);
  });

  it('returns at least 100 ECE courses', () => {
    expect(getDatasetCourseCount()).toBeGreaterThanOrEqual(100);
  });
});
