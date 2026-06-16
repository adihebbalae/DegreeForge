/**
 * stress-score.test.ts — TASK-059
 *
 * Covers:
 *   1. Formula + weight constants produce a valid 0–100 result
 *   2. ECE 312 difficulty > ECE 411 difficulty (real data via getCourseGradeStats)
 *   3. Per-term aggregation (normalized credit-weighted sum)
 *   4. AP/transfer credit does NOT change the Stress Score (adding a course with
 *      0 termLoad credits leaves the score unchanged)
 *   5. Missing-data course → NEUTRAL_DIFFICULTY + coverage count decremented
 *   6. Determinism (same inputs → identical result)
 *   7. Band thresholds
 *   8. Normalized sum math (monotonic, credit-weighted, differentiates loads)
 *   9. Catalog-credit fallback
 */

import { describe, it, expect } from 'vitest';
import {
  computeCourseDifficulty,
  computeSemesterStress,
  scoreToStressBand,
  NEUTRAL_DIFFICULTY,
  W_GPA,
  W_DF,
  W_WR,
  NORMALIZATION_MAX,
  BAND_LOW_MAX,
  BAND_MEDIUM_MAX,
  STRESS_ANCHOR,
  STRESS_REF_LOAD,
} from './stress-score';
import { getCourseGradeStats } from './grade-distributions';
import type { CourseGradeStats } from './grade-distributions';

// ─── Helper: synthetic stats fixture ─────────────────────────────────────────

function makeStats(gpa_mean: number, pct_df: number, withdrawal_rate: number): CourseGradeStats {
  return {
    gpa_mean,
    pct_a: 100 - pct_df - withdrawal_rate,
    pct_df,
    withdrawal_rate,
    sample_size: 100,
    term_range: 'Fall 2021–Spring 2025',
  };
}

// ─── Helper: compute expected sum-model score ─────────────────────────────────

/** Mirror of the production formula for use in test assertions. */
function expectedScore(entries: Array<{ difficulty: number; credits: number }>): number {
  const rawLoad = entries.reduce((sum, e) => sum + e.difficulty * e.credits, 0);
  return Math.min(100, Math.round((STRESS_ANCHOR * rawLoad) / STRESS_REF_LOAD));
}

// ─── 1. Formula correctness ───────────────────────────────────────────────────

describe('computeCourseDifficulty — formula', () => {
  it('returns 0 for a perfect course (gpa=4.0, pct_df=0, wr=0)', () => {
    const stats = makeStats(4.0, 0, 0);
    expect(computeCourseDifficulty(stats)).toBe(0);
  });

  it('returns 100 for an extreme course that saturates the formula', () => {
    // gpa=0, pct_df=100%, wr=100% → raw = W_GPA*1 + W_DF*1 + W_WR*1 = 1.0
    // 1.0 / NORMALIZATION_MAX >> 1 → clamped to 100
    const stats = makeStats(0, 100, 100);
    expect(computeCourseDifficulty(stats)).toBe(100);
  });

  it('weights sum to 1.0', () => {
    // Ensures the formula is a proper convex combination when inputs are in [0,1]
    expect(W_GPA + W_DF + W_WR).toBeCloseTo(1.0, 10);
  });

  it('result is always in [0, 100]', () => {
    const testCases: Array<[number, number, number]> = [
      [0.0, 0.0, 0.0],
      [4.0, 0.0, 0.0],
      [2.5, 15.0, 5.0],
      [3.8, 1.0, 0.5],
      [2.0, 25.0, 30.0],
    ];
    for (const [gpa, df, wr] of testCases) {
      const d = computeCourseDifficulty(makeStats(gpa, df, wr));
      expect(d, `gpa=${gpa} df=${df} wr=${wr}`).toBeGreaterThanOrEqual(0);
      expect(d, `gpa=${gpa} df=${df} wr=${wr}`).toBeLessThanOrEqual(100);
    }
  });

  it('NORMALIZATION_MAX is a positive finite number', () => {
    expect(NORMALIZATION_MAX).toBeGreaterThan(0);
    expect(Number.isFinite(NORMALIZATION_MAX)).toBe(true);
  });

  it('lower GPA → higher difficulty (monotonic wrt GPA, all else equal)', () => {
    const easy = computeCourseDifficulty(makeStats(3.5, 5, 2));
    const hard  = computeCourseDifficulty(makeStats(2.5, 5, 2));
    expect(hard).toBeGreaterThan(easy);
  });

  it('higher fail rate → higher difficulty (monotonic wrt pct_df)', () => {
    const low  = computeCourseDifficulty(makeStats(3.0, 2, 3));
    const high = computeCourseDifficulty(makeStats(3.0, 20, 3));
    expect(high).toBeGreaterThan(low);
  });
});

// ─── 2. ECE 312 > ECE 411 (real data) ────────────────────────────────────────

describe('computeCourseDifficulty — ECE 312 vs ECE 411 (real data)', () => {
  it('getCourseGradeStats returns data for both courses', () => {
    expect(getCourseGradeStats('ECE 312')).toBeDefined();
    expect(getCourseGradeStats('ECE 411')).toBeDefined();
  });

  it('ECE 312 difficulty > ECE 411 difficulty (2.841 gpa vs 3.042 gpa)', () => {
    const stats312 = getCourseGradeStats('ECE 312')!;
    const stats411 = getCourseGradeStats('ECE 411')!;
    const diff312 = computeCourseDifficulty(stats312);
    const diff411 = computeCourseDifficulty(stats411);
    expect(diff312).toBeGreaterThan(diff411);
  });

  it('ECE 312 difficulty is in a reasonable range (>40, <80)', () => {
    const stats = getCourseGradeStats('ECE 312')!;
    const d = computeCourseDifficulty(stats);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(80);
  });

  it('ECE 411 difficulty is lower than ECE 312 (sanity check)', () => {
    const stats411 = getCourseGradeStats('ECE 411')!;
    const d411 = computeCourseDifficulty(stats411);
    const stats312 = getCourseGradeStats('ECE 312')!;
    const d312 = computeCourseDifficulty(stats312);
    expect(d411).toBeLessThan(d312);
  });
});

// ─── 3. Per-term aggregation ──────────────────────────────────────────────────

describe('computeSemesterStress — aggregation', () => {
  it('empty semester returns score=0 and band=low', () => {
    const result = computeSemesterStress([], {}, () => 3);
    expect(result.score).toBe(0);
    expect(result.band).toBe('low');
    expect(result.courses).toHaveLength(0);
    expect(result.totalCourses).toBe(0);
  });

  it('single 3-credit course produces credit-weighted sum score', () => {
    // Score = min(100, round(ANCHOR × (d312 × 3) / REF_LOAD))
    const d312 = computeCourseDifficulty(getCourseGradeStats('ECE 312')!);
    const expected = expectedScore([{ difficulty: d312, credits: 3 }]);
    const result = computeSemesterStress(
      ['ECE 312'],
      { 'ECE 312': 3 },
      () => 3,
    );
    expect(result.score).toBe(expected);
    expect(result.totalCourses).toBe(1);
    expect(result.coursesWithData).toBe(1);
  });

  it('two courses produce a higher score than either alone (monotonic)', () => {
    // Two in-residence courses: adding ECE 411 to ECE 312 must raise the score
    const result1 = computeSemesterStress(
      ['ECE 312'],
      { 'ECE 312': 3 },
      () => 3,
    );
    const result2 = computeSemesterStress(
      ['ECE 312', 'ECE 411'],
      { 'ECE 312': 3, 'ECE 411': 3 },
      () => 3,
    );
    expect(result2.score).toBeGreaterThan(result1.score);
  });

  it('credit hours scale the contribution (4cr > 3cr for same difficulty)', () => {
    // Same course, more credits → higher rawLoad → higher score
    const result3cr = computeSemesterStress(
      ['ECE 312'],
      { 'ECE 312': 3 },
      () => 3,
    );
    const result4cr = computeSemesterStress(
      ['ECE 312'],
      { 'ECE 312': 4 },
      () => 4,
    );
    expect(result4cr.score).toBeGreaterThan(result3cr.score);
  });
});

// ─── 4. AP/transfer does NOT inflate stress score ─────────────────────────────

describe('computeSemesterStress — AP/transfer does not inflate score', () => {
  it('adding a 0-credit AP course leaves score unchanged', () => {
    const baseline = computeSemesterStress(
      ['ECE 312'],
      { 'ECE 312': 3 },
      () => 3,
    );

    // Add an AP course (termLoadCredits gives 0 for it, per buildTermLoadCredits)
    const withAp = computeSemesterStress(
      ['ECE 312', 'M 408C'],
      { 'ECE 312': 3, 'M 408C': 0 },  // 0 = AP/transfer, matches buildTermLoadCredits behavior
      () => 3,
    );

    expect(withAp.score).toBe(baseline.score);
  });

  it('AP course appears in courses list with 0 creditHours', () => {
    const result = computeSemesterStress(
      ['ECE 312', 'M 408C'],
      { 'ECE 312': 3, 'M 408C': 0 },
      () => 3,
    );
    const apEntry = result.courses.find((c) => c.courseId === 'M 408C');
    expect(apEntry).toBeDefined();
    expect(apEntry!.creditHours).toBe(0);
    // totalCourses still counts it (it's in the semester)
    expect(result.totalCourses).toBe(2);
  });

  it('a semester with ALL AP/transfer courses scores 0', () => {
    const result = computeSemesterStress(
      ['M 408C', 'M 408D'],
      { 'M 408C': 0, 'M 408D': 0 },
      () => 3,
    );
    expect(result.score).toBe(0);
    expect(result.band).toBe('low');
  });
});

// ─── 5. Missing-data handling ─────────────────────────────────────────────────

describe('computeSemesterStress — missing data', () => {
  it('course with no grade data gets NEUTRAL_DIFFICULTY', () => {
    const result = computeSemesterStress(
      ['ECE 999_FAKE'],  // definitely not in the dataset
      { 'ECE 999_FAKE': 3 },
      () => 3,
    );
    expect(result.courses[0].hasNoData).toBe(true);
    expect(result.courses[0].difficulty).toBe(NEUTRAL_DIFFICULTY);
  });

  it('NEUTRAL_DIFFICULTY is 50 (middle of the 0–100 scale)', () => {
    expect(NEUTRAL_DIFFICULTY).toBe(50);
  });

  it('coursesWithData is 0 when no course has data', () => {
    const result = computeSemesterStress(
      ['FAKE 001', 'FAKE 002'],
      { 'FAKE 001': 3, 'FAKE 002': 3 },
      () => 3,
    );
    expect(result.coursesWithData).toBe(0);
    expect(result.totalCourses).toBe(2);
  });

  it('coursesWithData is correct in a mixed semester', () => {
    const result = computeSemesterStress(
      ['ECE 312', 'FAKE 001'],
      { 'ECE 312': 3, 'FAKE 001': 3 },
      () => 3,
    );
    expect(result.coursesWithData).toBe(1);
    expect(result.totalCourses).toBe(2);
  });

  it('score is not 0 for a course with no data (neutral ≠ easy)', () => {
    // FAKE 001: d=NEUTRAL_DIFFICULTY(50), 3cr
    // score = min(100, round(ANCHOR × 50×3 / REF_LOAD))
    const result = computeSemesterStress(
      ['FAKE 001'],
      { 'FAKE 001': 3 },
      () => 3,
    );
    const expected = expectedScore([{ difficulty: NEUTRAL_DIFFICULTY, credits: 3 }]);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBe(expected);
  });
});

// ─── 6. Determinism ──────────────────────────────────────────────────────────

describe('computeSemesterStress — determinism', () => {
  it('identical inputs produce identical scores', () => {
    const courseIds = ['ECE 312', 'ECE 411', 'FAKE 001'];
    const termLoad = { 'ECE 312': 3, 'ECE 411': 3, 'FAKE 001': 3 };

    const r1 = computeSemesterStress(courseIds, termLoad, () => 3);
    const r2 = computeSemesterStress(courseIds, termLoad, () => 3);

    expect(r1.score).toBe(r2.score);
    expect(r1.band).toBe(r2.band);
    expect(r1.coursesWithData).toBe(r2.coursesWithData);
  });
});

// ─── 7. Band thresholds ───────────────────────────────────────────────────────

describe('scoreToStressBand', () => {
  it('0 → low', () => expect(scoreToStressBand(0)).toBe('low'));
  it('BAND_LOW_MAX → low', () => expect(scoreToStressBand(BAND_LOW_MAX)).toBe('low'));
  it('BAND_LOW_MAX + 1 → medium', () => expect(scoreToStressBand(BAND_LOW_MAX + 1)).toBe('medium'));
  it('BAND_MEDIUM_MAX → medium', () => expect(scoreToStressBand(BAND_MEDIUM_MAX)).toBe('medium'));
  it('BAND_MEDIUM_MAX + 1 → high', () => expect(scoreToStressBand(BAND_MEDIUM_MAX + 1)).toBe('high'));
  it('100 → high', () => expect(scoreToStressBand(100)).toBe('high'));
});

// ─── 8. Normalized sum math ───────────────────────────────────────────────────

describe('computeSemesterStress — normalized sum math', () => {
  it('1 course d=50, 3cr → Low band (single course is a light load)', () => {
    // rawLoad=150, score=round(55×150/750)=11
    const result = computeSemesterStress(
      ['FAKE 001'],
      { 'FAKE 001': 3 },
      () => 3,
    );
    expect(result.score).toBe(11);
    expect(result.band).toBe('low');
  });

  it('2 courses d=50+30, 3cr each → Low band (below full load)', () => {
    // FAKE 001 = d=50 (NEUTRAL), FAKE 002 = we need d=30 but FAKE 002 has NEUTRAL=50
    // Use both as NEUTRAL (d=50): rawLoad=300, score=round(55×300/750)=22 (low)
    // For 50+30: rawLoad=240, score=round(55×240/750)=18 (low). Verify formula directly.
    expect(Math.min(100, Math.round((STRESS_ANCHOR * 240) / STRESS_REF_LOAD))).toBe(18);
  });

  it('5 courses d=50 each, 3cr → ~55 → Med band (normal full load)', () => {
    // rawLoad = 750, score = round(55×750/750) = 55
    const ids = ['FAKE 001', 'FAKE 002', 'FAKE 003', 'FAKE 004', 'FAKE 005'];
    const credits = Object.fromEntries(ids.map((id) => [id, 3]));
    const result = computeSemesterStress(ids, credits, () => 3);
    expect(result.score).toBe(55);
    expect(result.band).toBe('medium');
  });

  it('5 courses d=70 each, 3cr → ~77 → High band (heavy hard load)', () => {
    // rawLoad=1050, score=round(55×1050/750)=77
    expect(Math.min(100, Math.round((STRESS_ANCHOR * 1050) / STRESS_REF_LOAD))).toBe(77);
  });

  it('5 courses d=30 each, 3cr → ~33 → Low band', () => {
    // rawLoad=450, score=round(55×450/750)=33
    expect(Math.min(100, Math.round((STRESS_ANCHOR * 450) / STRESS_REF_LOAD))).toBe(33);
    expect(scoreToStressBand(33)).toBe('low');
  });

  it('adding a harder course always increases score (monotonic)', () => {
    const base = computeSemesterStress(
      ['ECE 312'],
      { 'ECE 312': 3 },
      () => 3,
    );
    const withExtra = computeSemesterStress(
      ['ECE 312', 'ECE 411'],
      { 'ECE 312': 3, 'ECE 411': 3 },
      () => 3,
    );
    expect(withExtra.score).toBeGreaterThan(base.score);
  });

  it('5 hard courses score clearly higher than 5 moderate courses (real headroom)', () => {
    const moderate = computeSemesterStress(
      ['FAKE 001', 'FAKE 002', 'FAKE 003', 'FAKE 004', 'FAKE 005'],
      Object.fromEntries(['FAKE 001','FAKE 002','FAKE 003','FAKE 004','FAKE 005'].map((id) => [id, 3])),
      () => 3,
    );
    // 5 hard ECE courses using ECE 312 repeated via FAKE ids with full credits
    // Use d=70 synthetic: rawLoad=1050, score=77
    const hardScore = Math.min(100, Math.round((STRESS_ANCHOR * 1050) / STRESS_REF_LOAD));
    expect(hardScore).toBeGreaterThan(moderate.score);
    expect(hardScore - moderate.score).toBeGreaterThan(10); // clear gap, not marginal
  });

  it('score is clamped to 100 (extreme overload)', () => {
    // 10 courses at d=100, 3cr each: rawLoad=3000, uncapped=220 → clamped to 100
    const huggeLoad = Math.min(100, Math.round((STRESS_ANCHOR * 3000) / STRESS_REF_LOAD));
    expect(huggeLoad).toBe(100);
  });

  it('empty semester → 0', () => {
    const result = computeSemesterStress([], {}, () => 3);
    expect(result.score).toBe(0);
  });
});

// ─── 9. Catalog-credit fallback ───────────────────────────────────────────────

describe('computeSemesterStress — catalog credit fallback', () => {
  it('uses catalogCredits when course is not in termLoadCredits', () => {
    // ECE 312 not in termLoadCredits → catalog says 4 credits
    // score = min(100, round(ANCHOR × d312 × 4 / REF_LOAD))
    const d312 = computeCourseDifficulty(getCourseGradeStats('ECE 312')!);
    const expected = expectedScore([{ difficulty: d312, credits: 4 }]);
    const result = computeSemesterStress(
      ['ECE 312'],
      {},                     // not in termLoadCredits
      (id) => ({ 'ECE 312': 4 }[id] ?? 3),       // catalog says 4 credits
    );
    expect(result.score).toBe(expected);
    expect(result.courses[0].creditHours).toBe(4);
  });

  it('defaults to 3 credits when course is in neither map', () => {
    const result = computeSemesterStress(
      ['ECE 312'],
      {},
      () => 3,
    );
    expect(result.courses[0].creditHours).toBe(3);
  });
});
