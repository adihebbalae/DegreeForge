/**
 * Regression tests — TASK-061 Workstream A: Crash-proofing & data integrity
 *
 * These tests reproduce each QA crash / data-loss scenario so they can NEVER recur.
 * Each test is labelled with the acceptance criterion it gates.
 *
 * A1 — Injecting null + placeholder via EACH write path results in plan state
 *      containing ONLY valid course codes, dropped items identified, no crash/wipe.
 * A2 — Every courseId render-helper returns a safe default on null/empty/non-string.
 * A3 — Crash repros each have a passing regression test (no crash + no data loss).
 * A5 — Zod-reject best-effort recovery: partially-invalid persisted state recovers
 *      valid semesters rather than nuking the whole plan.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Sanitizer ─────────────────────────────────────────────────────────────────
import { sanitizeCourseList, sanitizePlan, isValidCourseId, COURSE_CODE_RE } from '../lib/sanitize-course-list';

// ── Reducer ───────────────────────────────────────────────────────────────────
import { planReducer, INITIAL_STATE } from '../context/PlanContext.constants';

// ── Render helpers ────────────────────────────────────────────────────────────
import { inferCategory, getCourseCredits, getCourseTitle } from '../lib/course-utils';
import { computeSemesterDifficulty } from '../lib/workload';
import { computeSemesterStress } from '../lib/stress-score';
import { computeProgress } from '../lib/progress';

// ── Schema ────────────────────────────────────────────────────────────────────
import { parsePlanState } from '../lib/plan-schema';

// ── Data loaders ──────────────────────────────────────────────────────────────
import type { UserProfile, DegreeRequirements, TechCores, MathRequirements } from '../types';

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const profile = loadJson<UserProfile>('user-profile.json');
const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const techCores = loadJson<TechCores>('tech-cores.json');
const mathReqs = loadJson<MathRequirements>('math-requirements.json');

// ─── 1. shared sanitizer unit tests ──────────────────────────────────────────

describe('sanitizeCourseList — shared sanitizer (TASK-061-A)', () => {
  it('isValidCourseId: accepts valid course codes', () => {
    for (const id of ['ECE 302', 'ECE 312H', 'M 427J', 'UGS 302', 'RHE 306', 'CTI 301G']) {
      expect(isValidCourseId(id)).toBe(true);
    }
  });

  it('isValidCourseId: rejects null, undefined, empty string, placeholders', () => {
    expect(isValidCourseId(null)).toBe(false);
    expect(isValidCourseId(undefined)).toBe(false);
    expect(isValidCourseId('')).toBe(false);
    expect(isValidCourseId('any 2 UD math courses')).toBe(false);
    expect(isValidCourseId('HOLD')).toBe(false);
    expect(isValidCourseId(42)).toBe(false);
  });

  it('sanitizeCourseList: returns only valid ids and all dropped tokens', () => {
    const ids: unknown[] = ['ECE 302', null, 'any 2 UD math', undefined, 'M 427J', 42];
    const { valid, dropped } = sanitizeCourseList(ids);
    expect(valid).toEqual(['ECE 302', 'M 427J']);
    expect(dropped).toContain(null);
    expect(dropped).toContain(undefined);
    expect(dropped).toContain('any 2 UD math');
    expect(dropped).toContain(42);
  });

  it('sanitizePlan: strips invalid tokens from every semester in a plan', () => {
    const rawPlan = {
      'Fall 2026':   ['ECE 460N', null, 'ECE 313'],
      'Spring 2027': ['M 362K', 'any 2 UD math courses'],
      'Summer 2027': [undefined, 'UGS 302'],
    };
    const { safePlan, dropped } = sanitizePlan(rawPlan as Record<string, unknown[]>);
    expect(safePlan['Fall 2026']).toEqual(['ECE 460N', 'ECE 313']);
    expect(safePlan['Spring 2027']).toEqual(['M 362K']);
    expect(safePlan['Summer 2027']).toEqual(['UGS 302']);
    expect(dropped.length).toBe(3);
  });
});

// ─── 2. Reducer-level guard (layer B) ────────────────────────────────────────

describe('PlanContext reducer — layer-B guard (TASK-061-A)', () => {
  it('ADD_COURSE: silently ignores null courseId', () => {
    const state = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: 'Fall 2026',
      courseId: null as unknown as string,
    });
    // State must not change when an invalid courseId is dispatched
    expect(state.plan['Fall 2026'] ?? []).not.toContain(null);
    expect(state).toBe(INITIAL_STATE); // reference-equal: no mutation
  });

  it('ADD_COURSE: silently ignores placeholder string', () => {
    const state = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: 'Fall 2026',
      courseId: 'any 2 UD math courses',
    });
    expect(state.plan['Fall 2026'] ?? []).not.toContain('any 2 UD math courses');
  });

  it('SET_PLAN: strips null and placeholder tokens before they reach plan state', () => {
    const dirtyPlan = {
      ...INITIAL_STATE.plan,
      'Fall 2026':   ['ECE 460N', null as unknown as string, 'ECE 313'],
      'Spring 2027': ['M 362K', 'any 2 UD math courses'],
    };
    const state = planReducer(INITIAL_STATE, { type: 'SET_PLAN', plan: dirtyPlan });
    expect(state.plan['Fall 2026']).toEqual(['ECE 460N', 'ECE 313']);
    expect(state.plan['Spring 2027']).toEqual(['M 362K']);
    // Every entry in every semester must pass COURSE_CODE_RE
    for (const courses of Object.values(state.plan)) {
      for (const id of courses) {
        expect(COURSE_CODE_RE.test(id)).toBe(true);
      }
    }
  });

  it('APPLY_WHAT_IF: strips null + placeholder tokens (regression: QA crash repro)', () => {
    // Regression: solver output with null + placeholder entered APPLY_WHAT_IF raw,
    // Zod rejected on reload, silently nuked the plan. With the guard this CANNOT recur.
    const solverDirtyOutput: Record<string, unknown[]> = {
      'Fall 2026':   ['ECE 460N', null, 'ECE 313'],
      'Spring 2027': ['M 362K', 'any 2 UD math courses', undefined],
    };
    const state = planReducer(INITIAL_STATE, {
      type: 'APPLY_WHAT_IF',
      newPlan: solverDirtyOutput as Record<string, string[]>,
    });
    expect(state.plan['Fall 2026']).toEqual(['ECE 460N', 'ECE 313']);
    expect(state.plan['Spring 2027']).toEqual(['M 362K']);
    expect(state.whatIf.isActive).toBe(true);
  });

  it('SET_FULL_STATE: strips invalid tokens from imported plan', () => {
    const importedWithBad = {
      ...INITIAL_STATE,
      plan: {
        ...INITIAL_STATE.plan,
        'Fall 2026': ['ECE 302', null as unknown as string, 'invalid token'],
      },
    };
    const state = planReducer(INITIAL_STATE, { type: 'SET_FULL_STATE', state: importedWithBad });
    expect(state.plan['Fall 2026']).toEqual(['ECE 302']);
  });

  it('REORDER_SEMESTER: strips invalid tokens from reordered list', () => {
    const courseIds = ['ECE 302', null as unknown as string, 'ECE 306', 'any placeholder'];
    const state = planReducer(INITIAL_STATE, {
      type: 'REORDER_SEMESTER',
      semesterId: 'Fall 2025',
      courseIds: courseIds as string[],
    });
    expect(state.plan['Fall 2025']).toEqual(['ECE 302', 'ECE 306']);
  });
});

// ─── 3. Render helper guards (A2 acceptance) ──────────────────────────────────

describe('Render helpers — null/empty/non-string guards (TASK-061-A2)', () => {
  // ── inferCategory (already guarded in 060, verify still holds) ───────────
  it('inferCategory(null) returns "elective" without throwing', () => {
    expect(() => inferCategory(null as unknown as string, {})).not.toThrow();
    expect(inferCategory(null as unknown as string, {})).toBe('elective');
  });

  it('inferCategory("") returns "elective" without throwing', () => {
    expect(inferCategory('', {})).toBe('elective');
  });

  it('inferCategory(undefined) returns "elective" without throwing', () => {
    expect(inferCategory(undefined as unknown as string, {})).toBe('elective');
  });

  // ── getCourseCredits ──────────────────────────────────────────────────────
  it('getCourseCredits(null) returns 3 without throwing', () => {
    expect(() => getCourseCredits(null as unknown as string, null, {})).not.toThrow();
    expect(getCourseCredits(null as unknown as string, null, {})).toBe(3);
  });

  it('getCourseCredits("") returns 3 without throwing', () => {
    expect(getCourseCredits('', null, {})).toBe(3);
  });

  // ── getCourseTitle ────────────────────────────────────────────────────────
  it('getCourseTitle(null) returns empty string without throwing', () => {
    expect(() => getCourseTitle(null as unknown as string, null, {})).not.toThrow();
    expect(getCourseTitle(null as unknown as string, null, {})).toBe('');
  });

  it('getCourseTitle("") returns empty string without throwing', () => {
    expect(getCourseTitle('', null, {})).toBe('');
  });

  it('getCourseTitle returns courseId as fallback for valid unknown course', () => {
    expect(getCourseTitle('ECE 999', null, {})).toBe('ECE 999');
  });

  // ── computeSemesterDifficulty (courseLevel) ───────────────────────────────
  it('computeSemesterDifficulty with null in courseIds returns green without throwing', () => {
    const sem = INITIAL_STATE.semesters[0];
    const planWithNull: Record<string, unknown[]> = { [sem.id]: [null, 'ECE 302'] };
    expect(() =>
      computeSemesterDifficulty(sem, planWithNull as Record<string, string[]>, {}, null, {})
    ).not.toThrow();
    const result = computeSemesterDifficulty(sem, planWithNull as Record<string, string[]>, {}, null, {});
    // Should not crash; bucket is one of the valid values
    expect(['green', 'yellow', 'orange', 'red']).toContain(result.bucket);
  });

  // ── computeSemesterStress ─────────────────────────────────────────────────
  it('computeSemesterStress with null in courseIds returns valid result without throwing', () => {
    const courseIds = [null as unknown as string, 'ECE 302', undefined as unknown as string];
    expect(() => computeSemesterStress(courseIds, {}, {})).not.toThrow();
    const result = computeSemesterStress(courseIds, {}, {});
    expect(typeof result.score).toBe('number');
    expect(['low', 'medium', 'high']).toContain(result.band);
  });

  // ── computeProgress (electiveHours filter) ────────────────────────────────
  it('computeProgress with null in plan does not crash', () => {
    const planWithNull: Record<string, unknown[]> = {
      ...INITIAL_STATE.plan,
      'Fall 2026': ['ECE 460N', null, 'placeholder text'],
    };
    expect(() =>
      computeProgress(
        planWithNull as Record<string, string[]>,
        profile,
        {} as never,
        {},
        degreeReqs,
        techCores.computer_architecture,
        false
      )
    ).not.toThrow();
  });
});

// ─── 4. QA crash repros (A3 acceptance) ──────────────────────────────────────

describe('QA crash repros — no crash + no data loss (TASK-061-A3)', () => {
  // Repro 1: What-If Apply with solver output containing null + placeholder
  it('Repro 1: APPLY_WHAT_IF null+placeholder → plan has only valid codes, no throw, no wipe', () => {
    const solverOutput: Record<string, unknown[]> = {
      'Fall 2026': ['ECE 460N', null, 'any 2 UD math courses', 'ECE 313'],
      'Spring 2027': ['M 362K'],
    };

    expect(() =>
      planReducer(INITIAL_STATE, {
        type: 'APPLY_WHAT_IF',
        newPlan: solverOutput as Record<string, string[]>,
      })
    ).not.toThrow();

    const state = planReducer(INITIAL_STATE, {
      type: 'APPLY_WHAT_IF',
      newPlan: solverOutput as Record<string, string[]>,
    });

    // No crash — whatIf.isActive is true (apply happened)
    expect(state.whatIf.isActive).toBe(true);
    // Plan holds ONLY valid codes
    for (const courses of Object.values(state.plan)) {
      for (const id of courses) {
        expect(COURSE_CODE_RE.test(id)).toBe(true);
      }
    }
    // Dropped tokens not in plan
    expect(state.plan['Fall 2026']).toEqual(['ECE 460N', 'ECE 313']);
  });

  // Repro 2: Auto-fix → Overwrite path (SET_PLAN with undefined/placeholder id)
  it('Repro 2: SET_PLAN with undefined/placeholder flowing to reducer → no throw, valid plan', () => {
    const badPlan = {
      ...INITIAL_STATE.plan,
      'Fall 2026': [undefined as unknown as string, 'placeholder text', 'ECE 302'],
    };

    expect(() =>
      planReducer(INITIAL_STATE, { type: 'SET_PLAN', plan: badPlan })
    ).not.toThrow();

    const state = planReducer(INITIAL_STATE, { type: 'SET_PLAN', plan: badPlan });
    expect(state.plan['Fall 2026']).toEqual(['ECE 302']);
  });

  // Repro 3: Import Plan with malformed data (null/placeholder in semester array)
  it('Repro 3: SET_FULL_STATE with malformed import → sanitized, no crash, no silent total wipe', () => {
    const importedState = {
      ...INITIAL_STATE,
      plan: {
        ...INITIAL_STATE.plan,
        'Fall 2025': ['ECE 302', 'ECE 306', null as unknown as string, 'CTI 301G'],
        'Spring 2026': ['ECE 312H', 'placeholder HOLD text'],
      },
    };

    expect(() =>
      planReducer(INITIAL_STATE, { type: 'SET_FULL_STATE', state: importedState })
    ).not.toThrow();

    const state = planReducer(INITIAL_STATE, { type: 'SET_FULL_STATE', state: importedState });
    // Valid courses preserved; invalid dropped; plan NOT wiped
    expect(state.plan['Fall 2025']).toEqual(['ECE 302', 'ECE 306', 'CTI 301G']);
    expect(state.plan['Spring 2026']).toEqual(['ECE 312H']);
    // Other semesters still exist (no silent wipe)
    expect(Object.keys(state.plan).length).toBeGreaterThan(2);
  });

  // Repro 4: null-in-plan render — guarded helpers return defaults, no throw
  it('Repro 4: null courseId in render helpers returns safe defaults without throwing', () => {
    const nullId = null as unknown as string;
    expect(() => inferCategory(nullId, {})).not.toThrow();
    expect(() => getCourseCredits(nullId, null, {})).not.toThrow();
    expect(() => getCourseTitle(nullId, null, {})).not.toThrow();
    expect(inferCategory(nullId, {})).toBe('elective');
    expect(getCourseCredits(nullId, null, {})).toBe(3);
    expect(getCourseTitle(nullId, null, {})).toBe('');
  });
});

// ─── 5. Zod best-effort recovery (A5 acceptance) ─────────────────────────────

describe('Zod schema — best-effort recovery (TASK-061-A5)', () => {
  it('partially-invalid persisted plan recovers valid courses rather than returning null', () => {
    // Simulates what localStorage might contain after a bad solver run.
    const partiallyCorrupt = {
      semesters: [
        { id: 'Fall 2025', label: "Fall '25", status: 'past', year: 2025, season: 'Fall' },
        { id: 'Spring 2026', label: "Sp '26", status: 'current', year: 2026, season: 'Spring' },
      ],
      plan: {
        'Fall 2025':   ['ECE 302', null, 'ECE 306', 'any 2 UD math'],
        'Spring 2026': ['ECE 312H', undefined],
      },
    };

    const result = parsePlanState(partiallyCorrupt as unknown as Record<string, unknown>);
    // Should NOT return null (best-effort recovery)
    expect(result).not.toBeNull();
    // Valid courses preserved
    expect(result!.plan['Fall 2025']).toEqual(['ECE 302', 'ECE 306']);
    expect(result!.plan['Spring 2026']).toEqual(['ECE 312H']);
  });

  it('fully-invalid plan record value is coerced to empty array, not rejected', () => {
    const corrupt = {
      semesters: [{ id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' }],
      plan: { 'Fall 2026': 'this-is-not-an-array' },
    };
    const result = parsePlanState(corrupt as unknown as Record<string, unknown>);
    expect(result).not.toBeNull();
    expect(result!.plan['Fall 2026']).toEqual([]);
  });

  it('structural failures (null semesters) still return null — not false-recovery', () => {
    // A plan with null semesters is structurally broken and should reject.
    const bad = { semesters: [null], plan: {} };
    expect(parsePlanState(bad as unknown as Record<string, unknown>)).toBeNull();
  });
});
