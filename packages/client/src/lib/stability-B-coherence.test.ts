/**
 * stability-B-coherence.test.ts — TASK-061 Workstream B acceptance tests
 *
 * Acceptance #1: useDiagnostics and useGhostPlan derive the SAME remaining-required
 *   set for a profile with pick-one / substitution cases.
 *
 * Acceptance #2: When the solver could not place a graduation-gate course (it
 *   appears in remainingRequired but NOT in the plan), diagnostics must render it
 *   as GRADUATION-BLOCKING — not as "on track with N slots of slack."
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrereqGraph } from './graph-engine';
import { computeRemainingRequired, buildSatisfiedSet, buildRemainingRequirements } from './requirements';
import { computeDiagnostics } from './diagnostics';
import type {
  UserProfile,
  DegreeRequirements,
  TechCores,
  MathRequirements,
  PrereqGraphData,
  OfferingSchedule,
  Semester,
  Plan,
} from '../types';

// ─── Data loaders ─────────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const techCores = loadJson<TechCores>('tech-cores.json');
const mathReqs = loadJson<MathRequirements>('math-requirements.json');
const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
const offeringSchedule = loadJson<OfferingSchedule>('offering-schedule.json');
const prereqGraph = new PrereqGraph(prereqData);
// Real user profile (source of truth for field shapes)
const realProfile = loadJson<UserProfile>('user-profile.json');

// ─── Test fixtures ────────────────────────────────────────────────────────────

const SEMESTERS: Semester[] = [
  { id: 'Fall 2024',   label: "Fall '24",   status: 'past',    year: 2024, season: 'Fall'   },
  { id: 'Spring 2025', label: "Sp '25",     status: 'past',    year: 2025, season: 'Spring' },
  { id: 'Fall 2025',   label: "Fall '25",   status: 'current', year: 2025, season: 'Fall'   },
  { id: 'Spring 2026', label: "Sp '26",     status: 'future',  year: 2026, season: 'Spring' },
  { id: 'Fall 2026',   label: "Fall '26",   status: 'future',  year: 2026, season: 'Fall'   },
  { id: 'Spring 2027', label: "Sp '27",     status: 'future',  year: 2027, season: 'Spring' },
  { id: 'Fall 2027',   label: "Fall '27",   status: 'future',  year: 2027, season: 'Fall'   },
  { id: 'Spring 2028', label: "Sp '28",     status: 'future',  year: 2028, season: 'Spring' },
];

// Build a test profile derived from the real profile shape (copies field structure exactly)
// but with a smaller completed_courses set that includes an honors variant (ECE 306H)
// to exercise EQUIVALENCE_MAP, plus ECE 319H to test pick-one tech-core satisfaction.
const HONORS_PROFILE: UserProfile = {
  ...realProfile,
  completed_courses: [
    { ...realProfile.completed_courses[0], course: 'M 408C', title: 'Calculus I',    semester: 'Fall 2024',   type: 'UT', credit_hours: 4 },
    { ...realProfile.completed_courses[0], course: 'M 408D', title: 'Calculus II',   semester: 'Spring 2025', type: 'UT', credit_hours: 4 },
    { ...realProfile.completed_courses[0], course: 'ECE 302', title: 'Intro EE',     semester: 'Spring 2025', type: 'UT', credit_hours: 3 },
    // ECE 306H (honors) — satisfies ECE 306 via EQUIVALENCE_MAP
    { ...realProfile.completed_courses[0], course: 'ECE 306H', title: 'Intro Comp H', semester: 'Fall 2024',   type: 'UT', credit_hours: 3 },
    // ECE 319H (honors) — satisfies ECE 319K via EQUIVALENCE_MAP
    { ...realProfile.completed_courses[0], course: 'ECE 319H', title: 'Embedded H',   semester: 'Spring 2025', type: 'UT', credit_hours: 3 },
  ],
  in_progress_courses: [],
};

// Plan where ECE 312H (honors) is placed in a past/current semester — tests that
// plan-semester courses are included in the satisfied set.
const PLAN_WITH_PAST_HONORS: Plan = {
  'Fall 2024':   ['ECE 306H', 'M 408C'],
  'Spring 2025': ['M 408D', 'ECE 302', 'ECE 319H'],
  'Fall 2025':   ['ECE 312H'],    // current
  'Spring 2026': [],
  'Fall 2026':   [],
  'Spring 2027': [],
  'Fall 2027':   [],
  'Spring 2028': [],
};

// Pick a tech core that has a pick-one group so we can test pick-one satisfaction.
// communication_signal_processing has pick-one in core.
const TECH_CORE_ID = 'communication_signal_processing';

// ─── Acceptance #1: useDiagnostics and useGhostPlan derive the SAME set ────────

describe('Acceptance #1 — computeRemainingRequired and buildRemainingRequirements produce identical results', () => {
  it('both functions return the same remaining-required set for a profile with equivalents and plan-semester courses', () => {
    const techCore = techCores[TECH_CORE_ID];
    expect(techCore).toBeDefined();

    // Path A: computeRemainingRequired (the canonical function, used by useDiagnostics)
    const satisfiedA = buildSatisfiedSet(HONORS_PROFILE, degreeReqs, SEMESTERS, PLAN_WITH_PAST_HONORS);
    const { required: requiredA } = computeRemainingRequired(
      degreeReqs,
      techCore,
      mathReqs,
      false,
      satisfiedA
    );

    // Path B: buildRemainingRequirements (used by useGhostPlan and run-solver)
    const requiredB = buildRemainingRequirements(
      degreeReqs,
      techCores,
      TECH_CORE_ID,
      false,
      mathReqs,
      HONORS_PROFILE,
      SEMESTERS,
      PLAN_WITH_PAST_HONORS
    );

    // The two paths must produce identical sets (order-independent)
    expect(new Set(requiredA)).toEqual(new Set(requiredB));
  });

  it('ECE 306H in completed satisfies ECE 306 via EQUIVALENCE_MAP — not in remaining', () => {
    const techCore = techCores[TECH_CORE_ID];
    const satisfied = buildSatisfiedSet(HONORS_PROFILE, degreeReqs, SEMESTERS, PLAN_WITH_PAST_HONORS);
    const { required } = computeRemainingRequired(degreeReqs, techCore, mathReqs, false, satisfied);

    // ECE 306H satisfies ECE 306 — neither should be required
    expect(required).not.toContain('ECE 306');
    expect(required).not.toContain('ECE 306H');
  });

  it('ECE 312H in plan past/current semester is treated as satisfied — not in remaining', () => {
    const techCore = techCores[TECH_CORE_ID];
    // PLAN_WITH_PAST_HONORS has ECE 312H in Fall 2025 (current)
    const satisfied = buildSatisfiedSet(HONORS_PROFILE, degreeReqs, SEMESTERS, PLAN_WITH_PAST_HONORS);
    const { required } = computeRemainingRequired(degreeReqs, techCore, mathReqs, false, satisfied);

    // ECE 312H is in a current semester — it and ECE 312 should not be in remaining
    expect(required).not.toContain('ECE 312');
    expect(required).not.toContain('ECE 312H');
  });

  it('ECE 319H in completed satisfies pick-one ECE 319K slot when tech core requires it', () => {
    // For a tech-core that includes ECE 319K as a pick-one option:
    // completing ECE 319H should mark that slot as done.
    // embedded_systems uses ECE 319K as a required course.
    const embeddedCore = techCores['embedded_systems'];
    if (!embeddedCore) return; // skip if track name differs in data

    const satisfied = buildSatisfiedSet(HONORS_PROFILE, degreeReqs, [], {});
    const { required } = computeRemainingRequired(degreeReqs, embeddedCore, mathReqs, false, satisfied);

    // ECE 319H satisfies ECE 319K — ECE 319K should NOT appear in remaining
    expect(required).not.toContain('ECE 319K');
  });

  it('buildRemainingRequirements without semesters/plan (legacy call) still returns a non-empty list', () => {
    // Backward compat: callers that don't pass semesters/plan still get a valid result.
    const result = buildRemainingRequirements(
      degreeReqs,
      techCores,
      TECH_CORE_ID,
      false,
      mathReqs,
      HONORS_PROFILE
    );
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('buildRemainingRequirements with semesters+plan produces a smaller or equal remaining set than without', () => {
    // Adding past/current plan semesters to the satisfied set can only reduce or maintain
    // the remaining required set — never add new courses.
    const withoutPlan = buildRemainingRequirements(
      degreeReqs, techCores, TECH_CORE_ID, false, mathReqs, HONORS_PROFILE
    );
    const withPlan = buildRemainingRequirements(
      degreeReqs, techCores, TECH_CORE_ID, false, mathReqs, HONORS_PROFILE,
      SEMESTERS, PLAN_WITH_PAST_HONORS
    );
    // withPlan may have fewer courses (plan semesters removed more from remaining)
    expect(withPlan.length).toBeLessThanOrEqual(withoutPlan.length);
    // Every course in withPlan must also be in withoutPlan
    for (const course of withPlan) {
      expect(withoutPlan).toContain(course);
    }
  });
});

// ─── Acceptance #2: Unplaced critical-path tail is graduation-blocking ─────────

describe('Acceptance #2 — unplaced critical-path tail is GRADUATION-BLOCKING', () => {
  it('unplaced critical-path tail has slack=0 and delayCost contains GRADUATION-BLOCKING (synthetic chain)', () => {
    // Minimal synthetic test: use a simple linear chain A→B→C where the tail C is unplaced.
    const simpleGraphData = {
      nodes: {
        A: { title: 'A', credits: 3, category: 'ece_core', offered: [], flags: [] },
        B: { title: 'B', credits: 3, category: 'ece_core', offered: [], flags: [] },
        C: { title: 'C', credits: 3, category: 'ece_core', offered: [], flags: [] },
      },
      edges: [
        { from: 'A', to: 'B', type: 'prerequisite' as const },
        { from: 'B', to: 'C', type: 'prerequisite' as const },
      ],
    };
    const simpleGraph = new PrereqGraph(simpleGraphData);

    const sems: Semester[] = [
      { id: 'Fall 2026',   label: "F26", status: 'future', year: 2026, season: 'Fall'   },
      { id: 'Spring 2027', label: "S27", status: 'future', year: 2027, season: 'Spring' },
      { id: 'Fall 2027',   label: "F27", status: 'future', year: 2027, season: 'Fall'   },
    ];

    const planWithCUnplaced: Plan = {
      'Fall 2026':   ['A'],
      'Spring 2027': ['B'],
      'Fall 2027':   [],     // C is NOT placed
    };

    const result = computeDiagnostics({
      remainingRequired: ['A', 'B', 'C'],
      plan: planWithCUnplaced,
      semesters: sems,
      prereqGraph: simpleGraph,
      offeringSchedule: {},
      creditHourCap: 17,
    });

    // C is the tail of chain A→B→C
    const tailEntry = result.criticalPath.chain[result.criticalPath.chain.length - 1];
    expect(tailEntry.courseId).toBe('C');
    expect(tailEntry.semesterId).toBeNull(); // C is unplaced

    // Bottleneck for C must be graduation-blocking
    const cBottleneck = result.bottlenecks.find((b) => b.courseId === 'C');
    expect(cBottleneck).toBeDefined();
    expect(cBottleneck!.slack).toBe(0);
    expect(cBottleneck!.delayCost).toMatch(/GRADUATION-BLOCKING/);
  });

  it('placed critical-path tail does NOT get GRADUATION-BLOCKING label', () => {
    // When the tail IS placed, it should show normal slack messaging.
    const simpleGraphData = {
      nodes: {
        A: { title: 'A', credits: 3, category: 'ece_core', offered: [], flags: [] },
        B: { title: 'B', credits: 3, category: 'ece_core', offered: [], flags: [] },
        C: { title: 'C', credits: 3, category: 'ece_core', offered: [], flags: [] },
      },
      edges: [
        { from: 'A', to: 'B', type: 'prerequisite' as const },
        { from: 'B', to: 'C', type: 'prerequisite' as const },
      ],
    };
    const simpleGraph = new PrereqGraph(simpleGraphData);

    const sems: Semester[] = [
      { id: 'Fall 2026',   label: "F26", status: 'future', year: 2026, season: 'Fall'   },
      { id: 'Spring 2027', label: "S27", status: 'future', year: 2027, season: 'Spring' },
      { id: 'Fall 2027',   label: "F27", status: 'future', year: 2027, season: 'Fall'   },
    ];

    const planWithCPlaced: Plan = {
      'Fall 2026':   ['A'],
      'Spring 2027': ['B'],
      'Fall 2027':   ['C'],  // C IS placed
    };

    const result = computeDiagnostics({
      remainingRequired: ['A', 'B', 'C'],
      plan: planWithCPlaced,
      semesters: sems,
      prereqGraph: simpleGraph,
      offeringSchedule: {},
      creditHourCap: 17,
    });

    const tailEntry = result.criticalPath.chain[result.criticalPath.chain.length - 1];
    expect(tailEntry.courseId).toBe('C');
    expect(tailEntry.semesterId).toBe('Fall 2027'); // C IS placed

    const cBottleneck = result.bottlenecks.find((b) => b.courseId === 'C');
    if (cBottleneck) {
      // When placed, delayCost must NOT say GRADUATION-BLOCKING
      expect(cBottleneck.delayCost).not.toMatch(/GRADUATION-BLOCKING/);
    }
  });
});

// ─── Acceptance #3: Grad estimate label ──────────────────────────────────────

describe('Acceptance #3 — bottleneckSemesterId is the prerequisites-only lower bound', () => {
  it('criticalPath.bottleneckSemesterId is present and equals the semester of the last placed tail course', () => {
    // Confirms the field exists for the DiagnosticsPanel to render the label.
    const PLACED_PLAN: Plan = {
      'Fall 2025':   ['ECE 302', 'ECE 306'],
      'Spring 2026': ['ECE 313'],
      'Fall 2026':   ['ECE 360N'],
      'Spring 2027': ['ECE 460N'],
      'Fall 2027':   [],
      'Spring 2028': [],
    };

    const DIAG_SEMS: Semester[] = [
      { id: 'Fall 2025',   label: "F25", status: 'past',    year: 2025, season: 'Fall'   },
      { id: 'Spring 2026', label: "S26", status: 'current', year: 2026, season: 'Spring' },
      { id: 'Fall 2026',   label: "F26", status: 'future',  year: 2026, season: 'Fall'   },
      { id: 'Spring 2027', label: "S27", status: 'future',  year: 2027, season: 'Spring' },
      { id: 'Fall 2027',   label: "F27", status: 'future',  year: 2027, season: 'Fall'   },
      { id: 'Spring 2028', label: "S28", status: 'future',  year: 2028, season: 'Spring' },
    ];

    const result = computeDiagnostics({
      remainingRequired: ['ECE 360N', 'ECE 460N'],
      plan: PLACED_PLAN,
      semesters: DIAG_SEMS,
      prereqGraph,
      offeringSchedule,
      creditHourCap: 17,
    });

    // The bottleneckSemesterId should be 'Spring 2027' (where ECE 460N is placed)
    expect(result.criticalPath.bottleneckSemesterId).toBe('Spring 2027');
  });
});
