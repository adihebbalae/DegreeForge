/**
 * TASK-067 — multi-department fetch hardening.
 *
 * Covers the two writer-side guarantees:
 *   1. Default department is "ECE" (UT renamed the dead "E E" fos_fl code).
 *   2. Fetching department A then department B into the same term accumulates
 *      both instead of overwriting (the data-loss bug).
 *
 * All logic is pure (no network, no disk) — exercises the exported helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  resolveDepartments,
  mergeCourses,
  mergeIntoExisting,
  DEFAULT_DEPARTMENT,
} from '../fetch-term';
import type { FallSections, CourseSections } from '../lib/parse-html';

function course(id: string, unique: number): CourseSections {
  return {
    course: id,
    title: `${id} TITLE`,
    sections: [
      {
        unique,
        meetings: [],
        instruction_mode: 'Face-to-face',
        instructor: 'Test',
        status: 'open',
        core: '',
      },
    ],
  };
}

function term(courses: Record<string, CourseSections>, source = 'test'): FallSections {
  return { semester: 'Fall 2026', semester_code: '20269', source, courses };
}

// ─── Default department ───────────────────────────────────────────────────────

describe('default department', () => {
  it('defaults to "ECE" (not the dead "E E" code) when no --department given', () => {
    expect(DEFAULT_DEPARTMENT).toBe('ECE');
    const args = parseArgs(['fall-2026']);
    expect(resolveDepartments(args)).toEqual(['ECE']);
  });

  it('uses the single department passed via --department', () => {
    const args = parseArgs(['fall-2026', '--department', 'M']);
    expect(resolveDepartments(args)).toEqual(['M']);
  });

  it('--department is repeatable — collects every value in order', () => {
    const args = parseArgs(['fall-2026', '--department', 'ECE', '--department', 'M', '--department', 'C S']);
    expect(resolveDepartments(args)).toEqual(['ECE', 'M', 'C S']);
  });
});

// ─── mergeCourses (section-level dedup) ───────────────────────────────────────

describe('mergeCourses', () => {
  it('adds new courses and dedups sections by unique number', () => {
    const into: Record<string, CourseSections> = {};
    mergeCourses(into, { 'ECE 302': course('ECE 302', 100) });
    mergeCourses(into, { 'ECE 302': course('ECE 302', 100) }); // duplicate unique
    expect(into['ECE 302'].sections).toHaveLength(1);

    mergeCourses(into, { 'ECE 302': course('ECE 302', 200) }); // new unique
    expect(into['ECE 302'].sections.map((s) => s.unique).sort()).toEqual([100, 200]);
  });
});

// ─── mergeIntoExisting (the no-overwrite guarantee) ───────────────────────────

describe('mergeIntoExisting', () => {
  it('returns fresh data when no existing file (or empty existing)', () => {
    const fresh = term({ 'ECE 302': course('ECE 302', 1) });
    expect(mergeIntoExisting(null, fresh)).toBe(fresh);
    expect(mergeIntoExisting(term({}), fresh)).toBe(fresh);
  });

  it('accumulates department B on top of department A — no overwrite', () => {
    // Simulate: run 1 wrote ECE to the term file; run 2 fetches M.
    const afterDeptA = term({ 'ECE 302': course('ECE 302', 10) }, 'authenticated-fetch:ECE');
    const deptB = term({ 'M 408C': course('M 408C', 20) }, 'authenticated-fetch:M');

    const result = mergeIntoExisting(afterDeptA, deptB);

    // BOTH departments survive.
    expect(Object.keys(result.courses).sort()).toEqual(['ECE 302', 'M 408C']);
    expect(result.courses['ECE 302'].sections[0].unique).toBe(10);
    expect(result.courses['M 408C'].sections[0].unique).toBe(20);
  });

  it('three-department accumulation keeps all (ECE + M + C S)', () => {
    let acc: FallSections | null = null;
    const runs = [
      term({ 'ECE 302': course('ECE 302', 1) }, 'fetch:ECE'),
      term({ 'M 408C': course('M 408C', 2) }, 'fetch:M'),
      term({ 'C S 314': course('C S 314', 3) }, 'fetch:C S'),
    ];
    for (const run of runs) {
      acc = mergeIntoExisting(acc, run);
    }
    expect(Object.keys(acc!.courses).sort()).toEqual(['C S 314', 'ECE 302', 'M 408C']);
  });

  it('records combined provenance when sources differ', () => {
    const a = term({ 'ECE 302': course('ECE 302', 1) }, 'fetch:ECE');
    const b = term({ 'M 408C': course('M 408C', 2) }, 'fetch:M');
    const result = mergeIntoExisting(a, b);
    expect(result.source).toBe('fetch:ECE + fetch:M');
  });
});
