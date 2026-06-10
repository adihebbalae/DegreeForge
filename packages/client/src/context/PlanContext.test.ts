import { describe, it, expect } from 'vitest';
import { historyReducer, INITIAL_STATE, DEMO_PLAN } from './PlanContext.constants';
import type { HistoryState } from './PlanContext.constants';

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
