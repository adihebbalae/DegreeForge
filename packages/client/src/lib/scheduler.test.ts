/**
 * scheduler.test.ts — Unit tests for generateSchedules node-budget + NaN guard
 * TASK-061: crash-proofing the scheduler backtracking search
 */

import { describe, it, expect } from 'vitest';
import { generateSchedules, SEARCH_NODE_BUDGET } from './scheduler';
import type { CourseSections } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a course with `n` sections that are all on different day-slots so they
 * never conflict with sections from OTHER courses either (each section is on a
 * unique day letter).  This maximises valid combinations because every
 * combination of sections is conflict-free, forcing the backtracker to explore
 * the full product.
 *
 * With 8 courses × 20 sections each the product is 20^8 = 25.6B — far more than
 * the node budget.  Using unique days (A-Z placeholders; the conflict check only
 * cares about shared day characters) keeps every pair non-conflicting.
 */
function makeNonConflictingCourse(id: string, sectionCount: number, baseUnique = 0): CourseSections {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({
    unique: baseUnique + i + 1,
    // Use a unique single-letter "day" per section so no two sections ever share a day.
    // The conflict function splits days into individual chars and looks for overlap.
    meetings: [{ days: String.fromCharCode(65 + ((baseUnique + i) % 26)), time: '9:00 a.m.-9:50 a.m.', room: 'ENS 145' }],
    instruction_mode: 'Face-to-face' as const,
    instructor: `Prof ${i}`,
    status: 'open' as const,
    core: '',
  }));
  return { course: id, title: `Course ${id}`, sections };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateSchedules — node budget (TASK-061 crash-proofing)', () => {
  it('completes quickly on a large non-conflicting selection and sets truncated=true', () => {
    // 8 courses × 20 sections each → 20^8 = 25.6 B valid combinations.
    // Every combination is conflict-free (sections use unique day letters), so
    // the backtracker never prunes — it must hit the node budget before finishing.
    const courses: CourseSections[] = Array.from({ length: 8 }, (_, i) =>
      makeNonConflictingCourse(`ECE ${300 + i}`, 20, i * 20)
    );

    const start = Date.now();
    const { candidates, truncated } = generateSchedules(courses, {});
    const elapsed = Date.now() - start;

    // Must return within a short wall-clock budget (generous 2s to cover CI overhead)
    expect(elapsed).toBeLessThan(2000);

    // With 20^8 valid combinations the node budget is hit — must truncate
    expect(truncated).toBe(true);

    // Still returns at most 5 candidates (the best found before truncation)
    expect(candidates.length).toBeLessThanOrEqual(5);

    // Scores are sorted descending
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].score).toBeGreaterThanOrEqual(candidates[i + 1].score);
    }
  });

  it('returns truncated=false for a small non-conflicting selection', () => {
    // 3 courses × 2 sections = 8 combinations max — well under any budget
    const courses: CourseSections[] = [
      makeNonConflictingCourse('ECE 302', 2, 200),
      {
        course: 'ECE 460',
        title: 'Course ECE 460',
        sections: [
          {
            unique: 200,
            meetings: [{ days: 'TTH', time: '11:00 a.m.-12:30 p.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof A',
            status: 'open',
            core: '',
          },
          {
            unique: 201,
            meetings: [{ days: 'TTH', time: '2:00 p.m.-3:30 p.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof B',
            status: 'open',
            core: '',
          },
        ],
      },
      {
        course: 'ECE 411',
        title: 'Course ECE 411',
        sections: [
          {
            unique: 300,
            meetings: [{ days: 'MWF', time: '1:00 p.m.-1:50 p.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof C',
            status: 'open',
            core: '',
          },
          {
            unique: 301,
            meetings: [{ days: 'MWF', time: '3:00 p.m.-3:50 p.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof D',
            status: 'open',
            core: '',
          },
        ],
      },
    ];

    const { candidates, truncated } = generateSchedules(courses, {});

    expect(truncated).toBe(false);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    // Scores sorted descending
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].score).toBeGreaterThanOrEqual(candidates[i + 1].score);
    }
  });
});

describe('generateSchedules — NaN guard (TASK-061)', () => {
  it('returns avgGpa=0 and does not produce NaN when called with zero courses', () => {
    // Zero-course input: backtrack hits the base case immediately with current=[].
    // old code: 0 / 0 = NaN. Fixed: current.length > 0 guard returns 0.
    const { candidates, truncated } = generateSchedules([], {});

    // One "empty" candidate (the empty combination is a valid leaf)
    expect(candidates.length).toBe(1);
    expect(truncated).toBe(false);

    const c = candidates[0];
    expect(isNaN(c.avgGpa)).toBe(false);
    expect(c.avgGpa).toBe(0);
    expect(c.totalGpa).toBe(0);
  });

  it('avgGpa is valid (not NaN) for a single-course selection', () => {
    const courses: CourseSections[] = [
      {
        course: 'ECE 316',
        title: 'Digital Logic',
        sections: [
          {
            unique: 16001,
            meetings: [{ days: 'MWF', time: '9:00 a.m.-9:50 a.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof Smith',
            status: 'open',
            core: '',
          },
        ],
      },
    ];
    const gradeDistributions = { 'ECE 316': { avg_gpa: 3.5, department: 'ECE', department_code: 'ECE', course_number: '316' } };

    const { candidates } = generateSchedules(courses, gradeDistributions as never);

    expect(candidates.length).toBe(1);
    expect(isNaN(candidates[0].avgGpa)).toBe(false);
    expect(candidates[0].avgGpa).toBeCloseTo(3.5);
  });
});

// Re-export the budget value so tests can assert it's reasonable
describe('SEARCH_NODE_BUDGET constant', () => {
  it('is exported and within expected range (10k–500k)', () => {
    expect(SEARCH_NODE_BUDGET).toBeGreaterThanOrEqual(10_000);
    expect(SEARCH_NODE_BUDGET).toBeLessThanOrEqual(500_000);
  });
});
