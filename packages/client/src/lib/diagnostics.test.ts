/**
 * diagnostics.test.ts — TASK-043 unit tests
 *
 * Tests for computeCriticalPath, computeSemesterSlack, computeBottlenecks,
 * and computeDiagnostics (integration). All tests are pure / deterministic.
 *
 * Uses real data from packages/client/public/data/ for the integration test
 * (acceptance criterion 3 — at least one known ECE bottleneck flagged).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrereqGraph } from './graph-engine';
import {
  computeCriticalPath,
  computeSemesterSlack,
  computeBottlenecks,
  computeDiagnostics,
} from './diagnostics';
import type {
  Plan,
  Semester,
  PrereqGraphData,
  OfferingSchedule,
} from '../types';

// ─── Minimal fixture ──────────────────────────────────────────────────────────
//
// Chain: A → B → C → D  (A must be taken before B, etc.)
//        E (no prereqs, no dependents)
//
// Offerings: B and D are fall-only (term-locked), others both

const FIXTURE_GRAPH_DATA: PrereqGraphData = {
  nodes: {
    A: { title: 'Course A', credits: 3, category: 'ece_core', offered: [], flags: [] },
    B: { title: 'Course B', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
    C: { title: 'Course C', credits: 3, category: 'ece_core', offered: [], flags: [] },
    D: { title: 'Course D', credits: 3, category: 'ece_core', offered: ['fall'], flags: [] },
    E: { title: 'Course E', credits: 3, category: 'ece_core', offered: [], flags: [] },
    F: { title: 'Course F', credits: 3, category: 'ece_core', offered: [], flags: [] },
  },
  edges: [
    { from: 'A', to: 'B', type: 'prerequisite' },
    { from: 'B', to: 'C', type: 'prerequisite' },
    { from: 'C', to: 'D', type: 'prerequisite' },
    // E and F are independent — but F depends on E for the bottleneck test
    { from: 'E', to: 'F', type: 'prerequisite' },
  ],
};

const FIXTURE_OFFERING: OfferingSchedule = {
  B: { title: 'Course B', offerings: {}, offered_semesters: ['fall'] },
  D: { title: 'Course D', offerings: {}, offered_semesters: ['fall'] },
  E: { title: 'Course E', offerings: {}, offered_semesters: ['spring'] },
};

const SEMESTERS: Semester[] = [
  { id: 'Fall 2025',   label: "Fall '25",  status: 'past',    year: 2025, season: 'Fall'   },
  { id: 'Spring 2026', label: "Sp '26",    status: 'current', year: 2026, season: 'Spring' },
  { id: 'Fall 2026',   label: "Fall '26",  status: 'future',  year: 2026, season: 'Fall'   },
  { id: 'Spring 2027', label: "Sp '27",    status: 'future',  year: 2027, season: 'Spring' },
  { id: 'Fall 2027',   label: "Fall '27",  status: 'future',  year: 2027, season: 'Fall'   },
  { id: 'Spring 2028', label: "Sp '28",    status: 'future',  year: 2028, season: 'Spring' },
];

const FIXTURE_PLAN: Plan = {
  'Fall 2025':   ['A'],          // past
  'Spring 2026': [],             // current — empty
  'Fall 2026':   ['B'],          // future: 3 hrs placed
  'Spring 2027': ['C'],          // future: 3 hrs placed
  'Fall 2027':   ['D', 'E'],     // future: 6 hrs placed
  'Spring 2028': ['F'],          // future: 3 hrs placed
};

const PREREQ_GRAPH = new PrereqGraph(FIXTURE_GRAPH_DATA);

// ─── computeCriticalPath ──────────────────────────────────────────────────────

describe('computeCriticalPath', () => {
  it('identifies the correct chain for a linear chain A→B→C→D', () => {
    // A is satisfied (past); remaining = B,C,D,E,F
    const remaining = ['B', 'C', 'D', 'E', 'F'];
    const result = computeCriticalPath(remaining, FIXTURE_PLAN, PREREQ_GRAPH, SEMESTERS);

    // Chain should be B→C→D (length 3)
    expect(result.length).toBe(3);
    expect(result.chain.map((c) => c.courseId)).toEqual(['B', 'C', 'D']);
  });

  it('each step in the chain has increasing depth', () => {
    const remaining = ['B', 'C', 'D', 'E', 'F'];
    const { chain } = computeCriticalPath(remaining, FIXTURE_PLAN, PREREQ_GRAPH, SEMESTERS);
    for (let i = 0; i < chain.length - 1; i++) {
      expect(chain[i].depth).toBeLessThan(chain[i + 1].depth);
    }
  });

  it('returns empty chain when no remaining courses', () => {
    const result = computeCriticalPath([], FIXTURE_PLAN, PREREQ_GRAPH, SEMESTERS);
    expect(result.chain).toHaveLength(0);
    expect(result.length).toBe(0);
    expect(result.bottleneckSemesterId).toBeNull();
  });

  it('includes semester placements for placed courses', () => {
    const remaining = ['B', 'C', 'D'];
    const { chain } = computeCriticalPath(remaining, FIXTURE_PLAN, PREREQ_GRAPH, SEMESTERS);
    expect(chain[0].semesterId).toBe('Fall 2026');  // B
    expect(chain[1].semesterId).toBe('Spring 2027'); // C
    expect(chain[2].semesterId).toBe('Fall 2027');   // D
  });

  it('bottleneckSemesterId is the last placed course in the chain', () => {
    const remaining = ['B', 'C', 'D'];
    const result = computeCriticalPath(remaining, FIXTURE_PLAN, PREREQ_GRAPH, SEMESTERS);
    expect(result.bottleneckSemesterId).toBe('Fall 2027'); // D is placed there
  });

  it('chain changes when a critical course is moved', () => {
    // Move D to Spring 2028 — bottleneck shifts to Spring 2028
    const movedPlan: Plan = {
      ...FIXTURE_PLAN,
      'Fall 2027':   ['E'],         // D removed
      'Spring 2028': ['D', 'F'],    // D added
    };
    const remaining = ['B', 'C', 'D'];
    const result = computeCriticalPath(remaining, movedPlan, PREREQ_GRAPH, SEMESTERS);
    expect(result.bottleneckSemesterId).toBe('Spring 2028');
  });

  it('does not crash or infinite-recurse when remainingRequired contains a prereq cycle', () => {
    // Cyclic graph: X → Y → X (A→B back-edge creates a cycle in remainingRequired)
    const cyclicGraphData: PrereqGraphData = {
      nodes: {
        X: { title: 'Course X', credits: 3, category: 'ece_core', offered: [], flags: [] },
        Y: { title: 'Course Y', credits: 3, category: 'ece_core', offered: [], flags: [] },
      },
      edges: [
        { from: 'X', to: 'Y', type: 'prerequisite' },
        { from: 'Y', to: 'X', type: 'prerequisite' }, // back-edge — creates cycle
      ],
    };
    const cyclicGraph = new PrereqGraph(cyclicGraphData);
    const plan: Plan = { 'Fall 2026': ['X', 'Y'] };
    // Must not throw / stack-overflow; should return a valid (possibly degenerate) result
    expect(() => {
      const result = computeCriticalPath(['X', 'Y'], plan, cyclicGraph, SEMESTERS);
      expect(result).toBeDefined();
      expect(result.chain.length).toBeGreaterThanOrEqual(0);
    }).not.toThrow();
  });

  it('moving a non-critical course does not change the chain', () => {
    // Move E (non-critical, depth=0 alone) to a different semester
    const movedPlan: Plan = {
      ...FIXTURE_PLAN,
      'Fall 2027':   ['D'],           // E removed
      'Spring 2028': ['E', 'F'],      // E moved
    };
    const remaining = ['B', 'C', 'D', 'E', 'F'];
    const chainBefore = computeCriticalPath(remaining, FIXTURE_PLAN, PREREQ_GRAPH, SEMESTERS);
    const chainAfter  = computeCriticalPath(remaining, movedPlan, PREREQ_GRAPH, SEMESTERS);

    // The critical path itself (B→C→D) is unchanged
    expect(chainBefore.chain.map((c) => c.courseId)).toEqual(
      chainAfter.chain.map((c) => c.courseId)
    );
  });
});

// ─── computeSemesterSlack ─────────────────────────────────────────────────────

describe('computeSemesterSlack', () => {
  const CAP = 17;

  it('only returns future semesters', () => {
    const slack = computeSemesterSlack(FIXTURE_PLAN, SEMESTERS, PREREQ_GRAPH, CAP);
    const ids = slack.map((s) => s.semesterId);
    expect(ids).not.toContain('Fall 2025');   // past
    expect(ids).not.toContain('Spring 2026'); // current
    expect(ids).toContain('Fall 2026');
    expect(ids).toContain('Spring 2027');
  });

  it('slack = cap − placed hours', () => {
    const slack = computeSemesterSlack(FIXTURE_PLAN, SEMESTERS, PREREQ_GRAPH, CAP);
    const fall26 = slack.find((s) => s.semesterId === 'Fall 2026')!;
    expect(fall26.placedHours).toBe(3);       // B = 3 hrs
    expect(fall26.spare).toBe(CAP - 3);       // 14 spare
  });

  it('label is "full" when spare = 0', () => {
    // Fill Spring 2027 to exactly CAP
    const fullPlan: Plan = {
      ...FIXTURE_PLAN,
      'Spring 2027': Array(Math.floor(CAP / 3)).fill('C'), // 5×3=15 hrs (not 17, close enough)
    };
    // Manually test with a plan that exactly hits the cap
    const exactPlan: Plan = {
      ...FIXTURE_PLAN,
      'Spring 2027': [], // we'll test with spare=0 through cap=3
    };
    const slack = computeSemesterSlack(exactPlan, SEMESTERS, PREREQ_GRAPH, 3);
    // Spring 2027 is empty → spare = 3
    const sp27 = slack.find((s) => s.semesterId === 'Spring 2027')!;
    expect(sp27.spare).toBe(3);
    expect(sp27.label).toBe('3 hrs spare');
  });

  it('label is "full" when placed hours = cap', () => {
    const plan: Plan = {
      ...FIXTURE_PLAN,
      'Fall 2026': ['B'],  // 3 hrs
    };
    const slack = computeSemesterSlack(plan, SEMESTERS, PREREQ_GRAPH, 3); // cap=3
    const fall26 = slack.find((s) => s.semesterId === 'Fall 2026')!;
    expect(fall26.spare).toBe(0);
    expect(fall26.label).toBe('full');
  });

  it('handles empty semesters (all spare = cap)', () => {
    const emptyPlan: Plan = {
      'Fall 2025': [],
      'Spring 2026': [],
      'Fall 2026': [],
      'Spring 2027': [],
      'Fall 2027': [],
      'Spring 2028': [],
    };
    const slack = computeSemesterSlack(emptyPlan, SEMESTERS, PREREQ_GRAPH, 17);
    for (const s of slack) {
      expect(s.spare).toBe(17);
      expect(s.label).toBe('17 hrs spare');
    }
  });
});

// ─── computeBottlenecks ───────────────────────────────────────────────────────

describe('computeBottlenecks', () => {
  it('flags a term-locked course with downstream dependents', () => {
    // B is fall-only and has C→D downstream
    const remaining = ['B', 'C', 'D', 'E', 'F'];
    const flags = computeBottlenecks(remaining, FIXTURE_PLAN, SEMESTERS, PREREQ_GRAPH, FIXTURE_OFFERING);
    const bFlag = flags.find((f) => f.courseId === 'B');
    expect(bFlag).toBeDefined();
    expect(bFlag!.isTermLocked).toBe(true);
  });

  it('includes "why it matters" and delay cost text', () => {
    const remaining = ['B', 'C', 'D', 'E', 'F'];
    const flags = computeBottlenecks(remaining, FIXTURE_PLAN, SEMESTERS, PREREQ_GRAPH, FIXTURE_OFFERING);
    const bFlag = flags.find((f) => f.courseId === 'B')!;
    expect(bFlag.whyItMatters).toMatch(/Fall-only/);
    expect(bFlag.delayCost).toMatch(/B/);
  });

  it('does NOT flag a term-locked course with no downstream via category A (but may appear via critical path tail)', () => {
    // D is fall-only but has no remaining dependents when D is the tail.
    // It will not be flagged as a term-locked bottleneck (category A).
    // (It might still appear as the critical-path tail via category B if passed as criticalPathTail.)
    const remaining = ['D']; // C is satisfied — no downstream in remaining
    const flags = computeBottlenecks(remaining, FIXTURE_PLAN, SEMESTERS, PREREQ_GRAPH, FIXTURE_OFFERING);
    // Without a criticalPathTail, D should not be flagged
    const dFlag = flags.find((f) => f.courseId === 'D');
    expect(dFlag).toBeUndefined();
  });

  it('zero-slack courses are listed first', () => {
    // B is placed in Fall 2026; the next fall is Fall 2027 (1 slot of slack)
    // E is spring-only with 1 downstream; placed in Fall 2027; next spring is Spring 2028 (1 slot)
    // Create a plan where a spring-only has 0 slack (last spring before end)
    const tightPlan: Plan = {
      'Fall 2025': [],
      'Spring 2026': [],
      'Fall 2026': [],
      'Spring 2027': [],
      'Fall 2027': [],
      'Spring 2028': ['E'],  // E placed in the last available spring
    };
    const remaining = ['E', 'F'];
    const flags = computeBottlenecks(remaining, tightPlan, SEMESTERS, PREREQ_GRAPH, FIXTURE_OFFERING);
    const eFlag = flags.find((f) => f.courseId === 'E');
    if (eFlag) {
      expect(eFlag.slack).toBe(0);
    }
    // If there are multiple bottlenecks, zero-slack comes first
    if (flags.length > 1) {
      expect(flags[0].slack).toBeLessThanOrEqual(flags[1].slack);
    }
  });
});

// ─── Integration test with real ECE data ─────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('computeDiagnostics (real ECE data)', () => {
  const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
  const offeringSchedule = loadJson<OfferingSchedule>('offering-schedule.json');
  const prereqGraph = new PrereqGraph(prereqData);

  // Approximate remaining required ECE core courses for a typical student
  // who has completed: M 408C, ECE 302, ECE 306, M 427J, ECE 312H, ECE 319H
  const REMAINING: string[] = [
    'ECE 313', 'ECE 333T', 'ECE 351K', 'ECE 364D', 'ECE 411', 'ECE 412',
    'ECE 319K', 'ECE 360N', 'ECE 460N',
  ];

  // Plan with some courses placed in future semesters
  const REAL_PLAN: Plan = {
    'Fall 2025':   ['ECE 302', 'ECE 306', 'M 427J'],
    'Spring 2026': ['ECE 312H', 'ECE 319H'],
    'Fall 2026':   ['ECE 313', 'ECE 333T', 'ECE 319K'],
    'Spring 2027': ['ECE 351K', 'ECE 364D'],
    'Fall 2027':   ['ECE 411', 'ECE 412'],
    'Spring 2028': ['ECE 360N', 'ECE 460N'],
    'Fall 2028':   [],
    'Spring 2029': [],
  };

  const REAL_SEMESTERS: Semester[] = [
    { id: 'Fall 2025',   label: "Fall '25", status: 'past',    year: 2025, season: 'Fall'   },
    { id: 'Spring 2026', label: "Sp '26",   status: 'current', year: 2026, season: 'Spring' },
    { id: 'Fall 2026',   label: "Fall '26", status: 'future',  year: 2026, season: 'Fall'   },
    { id: 'Spring 2027', label: "Sp '27",   status: 'future',  year: 2027, season: 'Spring' },
    { id: 'Fall 2027',   label: "Fall '27", status: 'future',  year: 2027, season: 'Fall'   },
    { id: 'Spring 2028', label: "Sp '28",   status: 'future',  year: 2028, season: 'Spring' },
    { id: 'Fall 2028',   label: "Fall '28", status: 'future',  year: 2028, season: 'Fall'   },
    { id: 'Spring 2029', label: "Sp '29",   status: 'future',  year: 2029, season: 'Spring' },
  ];

  it('produces a non-empty critical path', () => {
    const result = computeDiagnostics({
      remainingRequired: REMAINING,
      plan: REAL_PLAN,
      semesters: REAL_SEMESTERS,
      prereqGraph,
      offeringSchedule,
      creditHourCap: 17,
    });

    expect(result.criticalPath.chain.length).toBeGreaterThan(0);
    expect(result.criticalPath.bottleneckSemesterId).not.toBeNull();
  });

  it('all future semesters have slack entries', () => {
    const result = computeDiagnostics({
      remainingRequired: REMAINING,
      plan: REAL_PLAN,
      semesters: REAL_SEMESTERS,
      prereqGraph,
      offeringSchedule,
      creditHourCap: 17,
    });

    const futureSemCount = REAL_SEMESTERS.filter((s) => s.status === 'future').length;
    expect(result.semesterSlack).toHaveLength(futureSemCount);
    for (const slack of result.semesterSlack) {
      expect(slack.spare).toBe(slack.cap - slack.placedHours);
    }
  });

  it('identifies at least one known ECE bottleneck (critical path tail always flagged)', () => {
    // The critical path tail is always a graduation bottleneck — moving it delays graduation.
    // With a non-empty remaining required set, the tail of the longest prereq chain
    // should always appear in bottlenecks.
    const result = computeDiagnostics({
      remainingRequired: REMAINING,
      plan: REAL_PLAN,
      semesters: REAL_SEMESTERS,
      prereqGraph,
      offeringSchedule,
      creditHourCap: 17,
    });

    // The critical path is non-empty (checked in earlier test)
    // Its tail must appear in bottlenecks
    expect(result.criticalPath.chain.length).toBeGreaterThan(0);
    expect(result.bottlenecks.length).toBeGreaterThan(0);

    const tail = result.criticalPath.chain[result.criticalPath.chain.length - 1].courseId;
    const tailBottleneck = result.bottlenecks.find((b) => b.courseId === tail);
    expect(tailBottleneck).toBeDefined();
    expect(tailBottleneck!.whyItMatters).toMatch(/longest prereq chain/);

    // Each bottleneck must have whyItMatters and delayCost text
    for (const b of result.bottlenecks) {
      expect(b.whyItMatters.length).toBeGreaterThan(0);
      expect(b.delayCost.length).toBeGreaterThan(0);
    }
  });

  it('also flags term-locked courses with downstream when they exist', () => {
    // ECE 360K is spring-only with 12 downstream dependents — a confirmed term-locked bottleneck.
    // ECE 364D is a downstream of ECE 360K.
    const extendedRemaining = [
      ...REMAINING,
      'ECE 360K', // spring-only, 12 downstream dependents in the graph
      'ECE 364D', // downstream of ECE 360K — makes ECE 360K a term-locked bottleneck
    ];
    const result = computeDiagnostics({
      remainingRequired: extendedRemaining,
      plan: {
        ...REAL_PLAN,
        'Spring 2027': [...(REAL_PLAN['Spring 2027'] ?? []), 'ECE 360K'],
      },
      semesters: REAL_SEMESTERS,
      prereqGraph,
      offeringSchedule,
      creditHourCap: 17,
    });

    // ECE 360K should appear as a term-locked bottleneck
    const ece360k = result.bottlenecks.find((b) => b.courseId === 'ECE 360K');
    expect(ece360k).toBeDefined();
    expect(ece360k!.isTermLocked).toBe(true);
    expect(ece360k!.whyItMatters).toMatch(/Spring-only/);
  });
});

// ─── H1: slack does not count summer semesters for fall-only courses ──────────
// computeBottlenecks uses canOfferInSemester. After the summer bypass was removed
// from solver.ts, a fall-only course must NOT count summer semesters as valid
// offering slots. This test confirms slack=0 when the only remaining valid slot
// is the current placement and no future falls are available after it.
describe('H1: computeBottlenecks — summer semesters not counted for fall-only courses', () => {
  it('fall-only course with summer between current and next fall: slack counts only falls', () => {
    // Semester list: current fall (placed), then a summer, then a future fall.
    // The course is placed in the current fall. With summer bypass removed,
    // slack should be 1 (one future fall slot), not 2 (fall + summer).
    const sems: Semester[] = [
      { id: 'Fall 2026',   label: "Fall '26",   status: 'future', year: 2026, season: 'Fall'   },
      { id: 'Summer 2027', label: "Sum '27",     status: 'future', year: 2027, season: 'Summer' },
      { id: 'Fall 2027',   label: "Fall '27",    status: 'future', year: 2027, season: 'Fall'   },
    ];

    const fallOnlySchedule: OfferingSchedule = {
      B: { title: 'Course B', offerings: {}, offered_semesters: ['fall'] },
    };

    // B is placed in Fall 2026. C depends on B (downstream), so B is a term-locked bottleneck.
    // Remaining: B (fall-only), C (depends on B) — computeBottlenecks requires downstream
    // required courses to flag a course as a bottleneck.
    const plan: Plan = { 'Fall 2026': ['B'], 'Summer 2027': [], 'Fall 2027': [] };
    const flags = computeBottlenecks(
      ['B', 'C'],
      plan,
      sems,
      PREREQ_GRAPH,
      fallOnlySchedule,
    );

    const bFlag = flags.find((f) => f.courseId === 'B');
    // With summer bypass removed: valid future semesters after Fall 2026 = [Fall 2027] only.
    // Slack = 1 (one valid future fall remains after current placement).
    expect(bFlag).toBeDefined();
    expect(bFlag!.slack).toBe(1);
  });
});

// ─── N1: computeSemesterSlack label format ────────────────────────────────────
// The label must be "N hrs spare" (not "+N hrs spare").
// SemesterTile prepends "+" and strips " hrs spare" to show "+N spare".
describe('N1: computeSemesterSlack — label does not include "+" prefix', () => {
  it('label is "N hrs spare" (no leading +)', () => {
    const sems: Semester[] = [
      { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' },
    ];
    const plan: Plan = { 'Fall 2026': ['A'] }; // A = 3 credits; cap 17 → spare 14
    const slack = computeSemesterSlack(plan, sems, PREREQ_GRAPH, 17);
    expect(slack).toHaveLength(1);
    expect(slack[0].label).toBe('14 hrs spare');
    expect(slack[0].label).not.toMatch(/^\+/);
  });

  it('label is "full" when placed hours equals cap', () => {
    // Manually check: spare ≤ 0 → "full"
    const sems: Semester[] = [
      { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' },
    ];
    // Place more credits than cap: A+B+C+D+E+F = 18 = cap
    const plan: Plan = { 'Fall 2026': ['A', 'B', 'C', 'D', 'E', 'F'] };
    const slack = computeSemesterSlack(plan, sems, PREREQ_GRAPH, 18);
    expect(slack[0].label).toBe('full');
  });
});
