import { describe, it, expect } from 'vitest';
import { historyReducer, parseStoredPlan, INITIAL_STATE, DEMO_PLAN, reconcileSemesters, SEMESTERS } from './PlanContext.constants';
import type { HistoryState } from './PlanContext.constants';
import type { Semester } from '../types';

// ─── reconcileSemesters — Summer-term rehydration (TASK-051 wiring gap fix) ───
//
// AC1: an 8-entry Fall/Spring-only persisted semesters list (pre-TASK-051) gets
// the canonical Summer terms merged in, in correct chronological order, without
// losing any existing semester or its associated course placements.

describe('reconcileSemesters', () => {
  // Build the pre-TASK-051 8-entry list: Fall/Spring only, no Summer terms.
  // This mirrors exactly what a returning user would have in localStorage.
  const PRE_051_SEMESTERS: Semester[] = [
    { id: 'Fall 2025',   label: "Fall '25",  status: 'past',    year: 2025, season: 'Fall'   },
    { id: 'Spring 2026', label: "Sp '26",    status: 'current', year: 2026, season: 'Spring' },
    { id: 'Fall 2026',   label: "Fall '26",  status: 'future',  year: 2026, season: 'Fall'   },
    { id: 'Spring 2027', label: "Sp '27",    status: 'future',  year: 2027, season: 'Spring' },
    { id: 'Fall 2027',   label: "Fall '27",  status: 'future',  year: 2027, season: 'Fall'   },
    { id: 'Spring 2028', label: "Sp '28",    status: 'future',  year: 2028, season: 'Spring' },
    { id: 'Fall 2028',   label: "Fall '28",  status: 'future',  year: 2028, season: 'Fall'   },
    { id: 'Spring 2029', label: "Sp '29",    status: 'future',  year: 2029, season: 'Spring' },
  ];

  it('AC1: adds all three canonical Summer terms to a pre-TASK-051 8-entry list', () => {
    const result = reconcileSemesters(PRE_051_SEMESTERS);
    const ids = result.map((s) => s.id);
    expect(ids).toContain('Summer 2026');
    expect(ids).toContain('Summer 2027');
    expect(ids).toContain('Summer 2028');
    expect(result).toHaveLength(11); // 8 original + 3 Summer terms
  });

  it('AC1: merged list has correct chronological order (Spring N → Summer N → Fall N)', () => {
    const result = reconcileSemesters(PRE_051_SEMESTERS);
    const ids = result.map((s) => s.id);
    // Verify interleaving for each academic year that has a Summer
    const sp26 = ids.indexOf('Spring 2026');
    const su26 = ids.indexOf('Summer 2026');
    const fa26 = ids.indexOf('Fall 2026');
    expect(sp26).toBeLessThan(su26);
    expect(su26).toBeLessThan(fa26);

    const sp27 = ids.indexOf('Spring 2027');
    const su27 = ids.indexOf('Summer 2027');
    const fa27 = ids.indexOf('Fall 2027');
    expect(sp27).toBeLessThan(su27);
    expect(su27).toBeLessThan(fa27);

    const sp28 = ids.indexOf('Spring 2028');
    const su28 = ids.indexOf('Summer 2028');
    const fa28 = ids.indexOf('Fall 2028');
    expect(sp28).toBeLessThan(su28);
    expect(su28).toBeLessThan(fa28);
  });

  it('AC1: existing semester objects are preserved unchanged (status, label)', () => {
    const result = reconcileSemesters(PRE_051_SEMESTERS);
    const byId = Object.fromEntries(result.map((s) => [s.id, s]));

    // Existing semesters must come back identical (same object reference is
    // acceptable but not required — what matters is the field values)
    expect(byId['Fall 2025'].status).toBe('past');
    expect(byId['Spring 2026'].status).toBe('current');
    expect(byId['Fall 2026'].status).toBe('future');
  });

  it('AC1: returns the canonical SEMESTERS order exactly when given the full 11-entry list', () => {
    // Idempotent: calling reconcileSemesters on an already-complete list returns
    // the same list (same reference, because missing.length === 0 fast-path).
    const result = reconcileSemesters([...SEMESTERS]);
    expect(result.map((s) => s.id)).toEqual(SEMESTERS.map((s) => s.id));
  });

  it('AC1: added Summer semesters use canonical status (future)', () => {
    const result = reconcileSemesters(PRE_051_SEMESTERS);
    const byId = Object.fromEntries(result.map((s) => [s.id, s]));
    expect(byId['Summer 2026'].status).toBe('future');
    expect(byId['Summer 2027'].status).toBe('future');
    expect(byId['Summer 2028'].status).toBe('future');
  });

  it('AC1: idempotent — calling twice yields the same ids', () => {
    const once = reconcileSemesters(PRE_051_SEMESTERS);
    const twice = reconcileSemesters(once);
    expect(twice.map((s) => s.id)).toEqual(once.map((s) => s.id));
  });
});

// ─── repairPlan removal / Adi-data-leak regression ───────────────────────────
// Verifies that a stored plan with a heavy past semester (9+ courses) is NOT
// silently replaced with Adi's courses (DEMO_PLAN) on load.  The old `repairPlan`
// helper read DEMO_PLAN and overwrote past/current semesters, which would
// impersonate Adi for any transfer student who legitimately had 9+ past courses.

describe('historyReducer — no Adi data injection on heavy past semester', () => {
  it('does not replace a 9-course past semester with DEMO_PLAN data', () => {
    // Simulate a transfer student who imported 9 past courses into Fall 2025.
    const transferCourses = [
      'CS 101', 'CS 102', 'MATH 101', 'MATH 102',
      'ENG 101', 'PHYS 101', 'PHYS 102', 'CHEM 101', 'HIST 101',
    ];
    const heavyPastState = {
      ...INITIAL_STATE,
      plan: {
        ...INITIAL_STATE.plan,
        'Fall 2025': transferCourses,
      },
    };

    // The only action that triggers the old repairPlan was during localStorage
    // init (lazy initializer).  Here we test historyReducer directly to confirm
    // no action swaps in DEMO_PLAN courses.
    const initialHistory: HistoryState = {
      past: [],
      present: heavyPastState,
      future: [],
    };

    // Any no-op action should leave the state unchanged.
    const next = historyReducer(initialHistory, { type: 'SET_HOVERED_COURSE', courseId: null });

    expect(next.present.plan['Fall 2025']).toEqual(transferCourses);
    // Confirm none of Adi's courses sneaked in.
    const demoCourses = DEMO_PLAN['Fall 2025'];
    for (const c of demoCourses) {
      expect(next.present.plan['Fall 2025']).not.toContain(c);
    }
  });

  it('preserves a 9-course past semester across RESET_PLAN (gradeEntries preserved, plan reset)', () => {
    const transferCourses = Array.from({ length: 9 }, (_, i) => `TRANS ${100 + i}`);
    const state = {
      ...INITIAL_STATE,
      plan: { ...INITIAL_STATE.plan, 'Fall 2025': transferCourses },
      gradeEntries: { 'Fall 2025': { 'TRANS 100': 'A' } },
    };

    const history: HistoryState = { past: [], present: state, future: [] };
    const next = historyReducer(history, { type: 'RESET_PLAN' });

    // RESET_PLAN clears the plan but preserves gradeEntries (normal behavior).
    // The heavy semester is cleared from the timeline — that's expected for RESET.
    // Key assertion: Adi's courses are NOT in the result.
    const demoCourses = DEMO_PLAN['Fall 2025'];
    for (const c of demoCourses) {
      expect(next.present.plan['Fall 2025'] ?? []).not.toContain(c);
    }
    // gradeEntries preserved on RESET_PLAN.
    expect(next.present.gradeEntries).toEqual(state.gradeEntries);
  });
});

// ─── Theme H (item 3) + Theme A: parseStoredPlan — the lazy-initializer body ───
//
// The localStorage initializer (parse → Zod-validate → reconcile → backfill) was
// previously inline in the PlanProvider and untested; the prior regression test
// even admitted the bug lived in the initializer but tested the reducer instead.
// parseStoredPlan extracts that body so the real / legacy / malformed branches are
// unit-testable. It returns null on any unusable input so the persistence seam
// (lib/persist.ts) can tell "corrupt" (back up + warn) apart from "absent"
// (default silently) — a single bad field must never silently wipe the saved plan.

describe('parseStoredPlan', () => {
  it('returns null for an empty string (not valid JSON)', () => {
    expect(parseStoredPlan('')).toBeNull();
  });

  it('returns null for malformed JSON without throwing', () => {
    expect(() => parseStoredPlan('{not valid json')).not.toThrow();
    expect(parseStoredPlan('{not valid json')).toBeNull();
  });

  it('returns null for valid JSON that is not plan-shaped', () => {
    expect(parseStoredPlan(JSON.stringify({ foo: 1 }))).toBeNull();
  });

  it('returns null for a present whose schema is invalid (semesters not an array)', () => {
    expect(parseStoredPlan(JSON.stringify({ present: { semesters: 'nope', plan: {} } }))).toBeNull();
  });

  it('hydrates the new HistoryState format and backfills missing semesters', () => {
    const raw = JSON.stringify({
      present: { semesters: SEMESTERS, plan: { 'Fall 2025': ['ECE 306'] } },
      past: [],
      future: [],
    });
    const result = parseStoredPlan(raw)!;
    expect(result).not.toBeNull();
    expect(result.present.plan['Fall 2025']).toContain('ECE 306');
    // Every canonical semester gets a (possibly empty) plan entry.
    for (const sem of SEMESTERS) {
      expect(result.present.plan[sem.id]).toBeDefined();
    }
  });

  it('migrates the legacy top-level format and forces hoveredCourse to null', () => {
    const raw = JSON.stringify({ semesters: SEMESTERS, plan: { 'Fall 2025': ['ECE 302'] } });
    const result = parseStoredPlan(raw)!;
    expect(result.present.plan['Fall 2025']).toContain('ECE 302');
    expect(result.present.hoveredCourse).toBeNull();
  });

  it('recovers valid courses and drops corrupt tokens via the tolerant schema', () => {
    const raw = JSON.stringify({
      present: { semesters: SEMESTERS, plan: { 'Fall 2025': ['ECE 302', null, 'garbage token!!', 'M 427J'] } },
    });
    const result = parseStoredPlan(raw)!;
    expect(result.present.plan['Fall 2025']).toEqual(['ECE 302', 'M 427J']);
  });

  it('reconciles a pre-Summer (8-entry) persisted semesters list', () => {
    const PRE_051 = SEMESTERS.filter((s) => s.season !== 'Summer');
    const raw = JSON.stringify({ semesters: PRE_051, plan: { 'Fall 2025': ['ECE 302'] } });
    const ids = parseStoredPlan(raw)!.present.semesters.map((s) => s.id);
    expect(ids).toContain('Summer 2026');
    expect(ids).toContain('Summer 2027');
    expect(ids).toContain('Summer 2028');
  });
});
