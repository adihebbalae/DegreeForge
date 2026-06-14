/**
 * syllabus-display.test.ts
 *
 * Covers the three quality-gate helpers:
 *   1. gradingTotal() — sum of component percentages
 *   2. isGradingPlausible() — true iff ≥2 components AND sum ∈ [95, 105]
 *   3. dedupeTextbooks() — collapses fragments, respects cap
 */

import { describe, it, expect } from 'vitest';
import {
  gradingTotal,
  isGradingPlausible,
  dedupeTextbooks,
  GRADING_PLAUSIBLE_MIN,
  GRADING_PLAUSIBLE_MAX,
} from './syllabus-display';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('constants', () => {
  it('GRADING_PLAUSIBLE_MIN is 95', () => {
    expect(GRADING_PLAUSIBLE_MIN).toBe(95);
  });
  it('GRADING_PLAUSIBLE_MAX is 105', () => {
    expect(GRADING_PLAUSIBLE_MAX).toBe(105);
  });
});

// ─── gradingTotal ─────────────────────────────────────────────────────────────

describe('gradingTotal', () => {
  it('sums pct values', () => {
    expect(gradingTotal([{ pct: 40 }, { pct: 30 }, { pct: 30 }])).toBe(100);
  });

  it('returns 0 for empty array', () => {
    expect(gradingTotal([])).toBe(0);
  });

  it('handles fractional percentages', () => {
    expect(gradingTotal([{ pct: 33.3 }, { pct: 33.3 }, { pct: 33.4 }])).toBeCloseTo(100);
  });
});

// ─── isGradingPlausible ───────────────────────────────────────────────────────

describe('isGradingPlausible', () => {
  // ECE 306 real-world case: 2 + 17 + 25 = 44 (partial extraction)
  it('returns false for sum=44 (partial extraction, ECE 306 case)', () => {
    const components = [{ pct: 2 }, { pct: 17 }, { pct: 25 }];
    expect(isGradingPlausible(components)).toBe(false);
  });

  // Plausible case: exact 100
  it('returns true for sum=100 with 4 components', () => {
    const components = [{ pct: 10 }, { pct: 15 }, { pct: 40 }, { pct: 35 }];
    expect(isGradingPlausible(components)).toBe(true);
  });

  // Over-counted case (ECE 438 = 170%)
  it('returns false for sum=170 (over-counted, ECE 438 case)', () => {
    const components = [
      { pct: 40 },
      { pct: 40 },
      { pct: 30 },
      { pct: 30 },
      { pct: 30 },
    ];
    expect(isGradingPlausible(components)).toBe(false);
  });

  // Single component — not plausible even if the number is 100
  it('returns false for a single-component array (even if pct=100)', () => {
    expect(isGradingPlausible([{ pct: 100 }])).toBe(false);
  });

  // Empty array
  it('returns false for empty array', () => {
    expect(isGradingPlausible([])).toBe(false);
  });

  // Boundary: exactly 95 is plausible
  it('returns true for sum=95 (lower boundary)', () => {
    const components = [{ pct: 45 }, { pct: 50 }];
    expect(isGradingPlausible(components)).toBe(true);
  });

  // Boundary: exactly 105 is plausible
  it('returns true for sum=105 (upper boundary)', () => {
    const components = [{ pct: 55 }, { pct: 50 }];
    expect(isGradingPlausible(components)).toBe(true);
  });

  // Boundary: 94 is not plausible
  it('returns false for sum=94 (just below lower boundary)', () => {
    const components = [{ pct: 44 }, { pct: 50 }];
    expect(isGradingPlausible(components)).toBe(false);
  });

  // Boundary: 106 is not plausible
  it('returns false for sum=106 (just above upper boundary)', () => {
    const components = [{ pct: 56 }, { pct: 50 }];
    expect(isGradingPlausible(components)).toBe(false);
  });
});

// ─── dedupeTextbooks ─────────────────────────────────────────────────────────

describe('dedupeTextbooks', () => {
  // ECE 306-style: short fragment is a substring of the full citation
  it('collapses short fragment into the longer full citation', () => {
    const list = [
      'Introduction to Computing Systems: from bits and gates to C and beyond; Yale N. Patt and Sanjay J. Patel; Mc-Graw Hill, 2004, 2nd edition. You will need the 2nd edition.',
      'and Sanjay J. Patel; Mc-Graw Hill, 2004, 2nd edition. You will need the 2nd edition.',
    ];
    const result = dedupeTextbooks(list, 3);
    // The full citation should be kept; the fragment dropped
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Introduction to Computing Systems');
  });

  it('keeps distinct books', () => {
    const list = [
      'Circuits by Ulaby & Maharbiz, 2nd Ed.',
      'Fundamentals of Electric Circuits by Alexander & Sadiku, 4th Ed.',
    ];
    const result = dedupeTextbooks(list, 3);
    expect(result).toHaveLength(2);
  });

  it('respects the cap and returns at most cap entries', () => {
    const list = [
      'Book A: full title with details',
      'Book B: full title with details',
      'Book C: full title with details',
      'Book D: full title with details',
    ];
    const result = dedupeTextbooks(list, 2);
    expect(result).toHaveLength(2);
  });

  it('default cap is 3', () => {
    const list = [
      'Book A: a distinct reference',
      'Book B: another distinct reference',
      'Book C: yet another distinct reference',
      'Book D: fourth distinct reference',
    ];
    expect(dedupeTextbooks(list)).toHaveLength(3);
  });

  it('trims whitespace from entries', () => {
    const list = ['  Trimmed Book Title  ', 'Another Book'];
    const result = dedupeTextbooks(list, 3);
    expect(result[0]).toBe('Trimmed Book Title');
  });

  it('filters empty strings after trim', () => {
    const list = ['Real Book Title', '   ', ''];
    expect(dedupeTextbooks(list, 3)).toHaveLength(1);
  });

  it('is case-insensitive when detecting substrings', () => {
    // Lower-case fragment is a case-insensitive substring of upper-case full title
    const list = [
      'Introduction to COMPUTING SYSTEMS from bits and gates',
      'introduction to computing systems from bits and gates with more context here',
    ];
    const result = dedupeTextbooks(list, 3);
    expect(result).toHaveLength(1);
  });

  it('handles a 5000-element input without error and returns at most the cap', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `Unique Book Title Number ${i}`);
    const result = dedupeTextbooks(big, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });
});
