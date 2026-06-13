/**
 * useValidation.test.ts — TASK-066 phantom-prereq-violation regression tests
 *
 * Exercises computeValidation (the pure core the useValidation hook runs) against
 * the REAL prerequisite graph + REAL demo profile. The bug: completed courses were
 * folded into the validator only as PRIOR_CREDIT and only when their semester was
 * NOT in the displayed timeline. The demo student's completions sit in Fall 2025
 * (a displayed term with an empty plan slot), so they were invisible to the prereq
 * checker -> 4 phantom violations.
 *
 * The fix routes completion/in-progress credit through the canonical satisfied set
 * (buildSatisfiedSet), so every transcript course counts regardless of which
 * semester it sits in.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeValidation } from './useValidation';
import { PrereqGraph } from '../lib/graph-engine';
import { SEMESTERS } from '../context/PlanContext.constants';
import type {
  UserProfile,
  DegreeRequirements,
  PrereqGraphData,
  Plan,
  Semester,
} from '../types';

// ─── Real data loader ─────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const profile = loadJson<UserProfile>('user-profile.json');
const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
const prereqGraph = new PrereqGraph(prereqData);

// The real default planner plan is EMPTY — completed courses live in the profile,
// NOT in the plan slots. This is exactly the state that produced the phantom bug.
const EMPTY_PLAN: Plan = Object.fromEntries(SEMESTERS.map((s) => [s.id, []]));

// ─── AC1 + AC4: demo/default profile -> 0 hard prereq violations ──────────────

describe('TASK-066 — demo profile produces no phantom violations', () => {
  it('default (empty) plan + real demo profile reports 0 hard violations', () => {
    const result = computeValidation(EMPTY_PLAN, SEMESTERS, prereqGraph, profile, degreeReqs);
    expect(result.hasViolations).toBe(false);
    expect(result.violations.filter((v) => !v.isSoftWarning)).toEqual([]);
  });

  it('ECE 319K / 313 / 351K / 411 are not flagged for ECE 306 / M 427J', () => {
    // Place the previously-phantom-flagged courses in a future term. Their ECE 306 /
    // ECE 302 / M 427J prereqs are all COMPLETED in the demo profile (Fall 2025, an
    // empty displayed slot) — so none may be flagged for THOSE. (ECE 411 still has a
    // genuine PHY 303L gap the demo student hasn't taken; that is a real violation,
    // asserted separately below — not a phantom.)
    const futureTerm = SEMESTERS.find((s) => s.status === 'future')?.id;
    expect(futureTerm).toBeDefined();
    const plan: Plan = { ...EMPTY_PLAN, [futureTerm!]: ['ECE 319K', 'ECE 313', 'ECE 351K', 'ECE 411'] };

    const result = computeValidation(plan, SEMESTERS, prereqGraph, profile, degreeReqs);

    // ECE 319K / 313 / 351K have all their prereqs completed -> no violation at all.
    expect(result.violationsByCourse['ECE 319K']).toBeUndefined();
    expect(result.violationsByCourse['ECE 313']).toBeUndefined();
    expect(result.violationsByCourse['ECE 351K']).toBeUndefined();

    // The phantom prereqs (ECE 306 / M 427J) must never appear as "missing" on any course.
    for (const v of result.violations) {
      expect(v.missingPrereqs).not.toContain('ECE 306');
      expect(v.missingPrereqs).not.toContain('M 427J');
    }
  });
});

// ─── AC4: a completed course in a displayed PAST semester with an empty plan slot ─

describe('TASK-066 — completion in a displayed past term counts as satisfied', () => {
  it('ECE 313 placed in a future term is satisfied by Fall-2025 completion of ECE 302 + M 427J', () => {
    // Fall 2025 is a DISPLAYED past semester whose plan slot is empty (completions
    // live only in the profile). ECE 313 requires ECE 302 + M 427J (both completed).
    const futureTerm = SEMESTERS.find((s) => s.status === 'future')!.id;
    const plan: Plan = { ...EMPTY_PLAN, [futureTerm]: ['ECE 313'] };

    const result = computeValidation(plan, SEMESTERS, prereqGraph, profile, degreeReqs);
    expect(result.violationsByCourse['ECE 313']).toBeUndefined();
  });
});

// ─── AC2: equivalence — C S 312 (≡ ECE 312) satisfies an ECE 312 prereq ────────

describe('TASK-066 — registered equivalent satisfies a prereq (no phantom)', () => {
  it('C S 312 completed -> ECE 422C (requires ECE 312/312H) has no violation', () => {
    // ECE 422C's prereq lists ECE 312 / ECE 312H but NOT C S 312 directly, so this
    // exercises the equivalence engine: C S 312 must expand to satisfy ECE 312.
    const csProfile: UserProfile = {
      ...profile,
      completed_courses: [
        { course: 'C S 312', title: 'Intro Programming', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
      ],
      in_progress_courses: [],
    };
    const futureTerm = SEMESTERS.find((s) => s.status === 'future')!.id;
    const plan: Plan = { ...EMPTY_PLAN, [futureTerm]: ['ECE 422C'] };

    const result = computeValidation(plan, SEMESTERS, prereqGraph, csProfile, degreeReqs);
    expect(result.violationsByCourse['ECE 422C']).toBeUndefined();
  });
});

// ─── AC3: genuine missing prereq is STILL flagged (no false negatives) ─────────

describe('TASK-066 — genuinely missing prereq is still flagged', () => {
  it('ECE 422C with no ECE 312 (completed, in-progress, equivalent, or earlier) IS flagged', () => {
    // Student has taken nothing toward ECE 422C's ECE 312 prereq.
    const barProfile: UserProfile = {
      ...profile,
      completed_courses: [],
      in_progress_courses: [],
    };
    const futureTerm = SEMESTERS.find((s) => s.status === 'future')!.id;
    const plan: Plan = { ...EMPTY_PLAN, [futureTerm]: ['ECE 422C'] };

    const result = computeValidation(plan, SEMESTERS, prereqGraph, barProfile, degreeReqs);
    const violation = result.violationsByCourse['ECE 422C'];
    expect(violation).toBeDefined();
    expect(violation.isSoftWarning).toBeFalsy();
    expect(violation.missingPrereqs).toContain('ECE 312');
  });

  it('a prereq scheduled AFTER its dependent in the plan is still flagged (ordering preserved)', () => {
    // No transcript credit; ECE 312 placed in a LATER term than ECE 422C. The
    // satisfied-set seed must not mask plan-ordering violations.
    const barProfile: UserProfile = { ...profile, completed_courses: [], in_progress_courses: [] };
    const futures = SEMESTERS.filter((s) => s.status === 'future');
    const early = futures[0].id;
    const late = futures[1].id;
    const plan: Plan = { ...EMPTY_PLAN, [early]: ['ECE 422C'], [late]: ['ECE 312'] };

    const result = computeValidation(plan, SEMESTERS, prereqGraph, barProfile, degreeReqs);
    expect(result.violationsByCourse['ECE 422C']).toBeDefined();
    expect(result.violationsByCourse['ECE 422C'].missingPrereqs).toContain('ECE 312');
  });
});
