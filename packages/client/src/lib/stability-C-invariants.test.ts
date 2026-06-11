/**
 * stability-C-invariants.test.ts — TASK-061 Workstream C acceptance tests
 *
 * Invariant: for each load tolerance, the per-semester credit cap value used by
 *   the overview tile (SemesterTile), the focus column (SemesterColumn / FocusEditor),
 *   and the slack computation (computeSemesterSlack / useDiagnostics) is identical —
 *   all derived from getCreditHourCap in auto-planner.ts.
 *
 * Acceptance #1: getCreditHourCap(profile) == semesterSlack[n].cap for every
 *   future semester, for all four canonical load tolerances.
 *
 * Acceptance #2: getCreditHourCap(null) equals getCreditHourCap(profile with
 *   normal tolerance) — the null/loading fallback and the explicit normal profile
 *   agree, so the component default param never diverges from the canonical value.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrereqGraph } from './graph-engine';
import { getCreditHourCap } from './auto-planner';
import { computeSemesterSlack } from './diagnostics';
import type {
  UserProfile,
  PrereqGraphData,
  Semester,
  Plan,
} from '../types';

// ─── Data loaders ─────────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
const prereqGraph = new PrereqGraph(prereqData);
const realProfile = loadJson<UserProfile>('user-profile.json');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FUTURE_SEMESTERS: Semester[] = [
  { id: 'Spring 2026', label: "Sp '26", status: 'future', year: 2026, season: 'Spring' },
  { id: 'Fall 2026',   label: "Fall '26", status: 'future', year: 2026, season: 'Fall'   },
  { id: 'Spring 2027', label: "Sp '27", status: 'future', year: 2027, season: 'Spring' },
];

const EMPTY_PLAN: Plan = {};

/** Build a test profile with the given load tolerance. */
function makeProfile(tol: string): UserProfile {
  return {
    ...realProfile,
    preferences: {
      ...realProfile.preferences,
      course_load_tolerance: tol as UserProfile['preferences']['course_load_tolerance'],
    },
  };
}

// ─── Acceptance #1 — cap identity across overview tile, focus column, slack ───
//
// The overview tile (SemesterTile) receives creditHourCap from OverviewYearGrid,
// which derives it via getCreditHourCap(effectiveProfile).
// The focus column (SemesterColumn via FocusEditor) derives it identically.
// The slack computation (computeSemesterSlack) receives the same cap value.
// Therefore: getCreditHourCap(profile) must equal semesterSlack[n].cap for every n.

describe('Acceptance #1 — cap is identical across tile, column, and slack for each tolerance', () => {
  const TOLERANCES: Array<{ tol: string; expected: number }> = [
    { tol: 'light',         expected: 15 },
    { tol: 'normal',        expected: 17 },
    { tol: 'above_average', expected: 18 },
    { tol: 'heavy',         expected: 19 },
  ];

  for (const { tol, expected } of TOLERANCES) {
    it(`tolerance="${tol}" — getCreditHourCap returns ${expected} and all slack entries carry cap=${expected}`, () => {
      const profile = makeProfile(tol);
      const cap = getCreditHourCap(profile);

      // getCreditHourCap returns the correct canonical value
      expect(cap).toBe(expected);

      // computeSemesterSlack is the single function used by useDiagnostics to
      // populate semesterSlack[n].cap, which OverviewYearGrid reads back to
      // pass as creditHourCap to every SemesterTile.
      const slack = computeSemesterSlack(EMPTY_PLAN, FUTURE_SEMESTERS, prereqGraph, cap);

      expect(slack).toHaveLength(FUTURE_SEMESTERS.length);

      for (const entry of slack) {
        // Every slack entry must carry the SAME cap value that getCreditHourCap produced.
        // If any entry diverges, overview tile cap and slack cap are inconsistent.
        expect(entry.cap).toBe(cap);
        // spare = cap - placedHours; with empty plan placedHours=0, so spare=cap
        expect(entry.spare).toBe(cap);
      }
    });
  }
});

// ─── Acceptance #2 — null-profile fallback equals normal-profile cap ──────────
//
// SemesterTile and SemesterColumn use getCreditHourCap(null) as their default
// parameter so the literal 17 lives only inside getCreditHourCap.
// This test asserts that the null fallback equals getCreditHourCap('normal'),
// i.e. no behavioral difference between "loading" and "explicitly normal" states.

describe('Acceptance #2 — getCreditHourCap(null) equals getCreditHourCap(normal profile)', () => {
  it('getCreditHourCap(null) returns the normal-load default (17)', () => {
    expect(getCreditHourCap(null)).toBe(17);
  });

  it('getCreditHourCap(null) equals getCreditHourCap(normal profile)', () => {
    const normalProfile = makeProfile('normal');
    expect(getCreditHourCap(null)).toBe(getCreditHourCap(normalProfile));
  });

  it('getCreditHourCap(null) equals getCreditHourCap(undefined-tolerance profile)', () => {
    const undefinedTolProfile = makeProfile('__undefined__');
    expect(getCreditHourCap(null)).toBe(getCreditHourCap(undefinedTolProfile));
  });
});

// ─── Sanity — no other literal cap values exist at module scope ───────────────
//
// These tests aren't exhaustive (they operate at the pure-logic layer, not DOM),
// but they lock the numeric contract so any future change to getCreditHourCap
// breaks loudly here before reaching a component.

describe('Sanity — all four canonical caps are stable', () => {
  it('light=15, normal=17, above_average=18, heavy=19 — unchanged', () => {
    expect(getCreditHourCap(makeProfile('light'))).toBe(15);
    expect(getCreditHourCap(makeProfile('normal'))).toBe(17);
    expect(getCreditHourCap(makeProfile('above_average'))).toBe(18);
    expect(getCreditHourCap(makeProfile('heavy'))).toBe(19);
  });
});
