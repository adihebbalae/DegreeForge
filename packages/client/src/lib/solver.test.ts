import { describe, it, expect, beforeEach } from 'vitest';
import { generatePlan, type SolverInput } from './solver';
import { PrereqGraph } from './graph-engine';
import type { PrereqGraphData, Semester, OfferingSchedule } from '../types';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockGraphData: PrereqGraphData = {
  nodes: {
    'M 408C':   { title: 'Calc I',             credits: 4, category: 'math',     offered: ['fall', 'spring'], flags: [] },
    'M 408D':   { title: 'Calc II',            credits: 4, category: 'math',     offered: ['fall', 'spring'], flags: [] },
    'M 427J':   { title: 'Diff Eq',            credits: 4, category: 'math',     offered: ['fall', 'spring'], flags: [] },
    'M 340L':   { title: 'Linear Algebra',     credits: 3, category: 'math',     offered: ['fall', 'spring'], flags: [] },
    'M 325K':   { title: 'Discrete Math',      credits: 3, category: 'math',     offered: ['fall', 'spring'], flags: [] },
    'ECE 302':  { title: 'Intro EE',           credits: 3, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 306':  { title: 'Intro Computing',    credits: 3, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 312':  { title: 'Software I',         credits: 3, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 319K': { title: 'Embedded Systems',   credits: 4, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 411':  { title: 'Circuit Theory',     credits: 3, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 313':  { title: 'Linear Systems',     credits: 3, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 316':  { title: 'Digital Logic',      credits: 3, category: 'ece_upper',offered: ['fall', 'spring'], flags: [] },
    'ECE 460N': { title: 'Computer Arch',      credits: 3, category: 'ece_upper',offered: ['fall', 'spring'], flags: [] },
    'ECE 360C': { title: 'Algorithms',         credits: 3, category: 'ece_upper',offered: ['fall', 'spring'], flags: [] },
    'ECE 445L': { title: 'Embedded Lab',       credits: 6, category: 'ece_upper',offered: ['fall', 'spring'], flags: [] },
    'ECE 351K': { title: 'Probability',        credits: 3, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 333T': { title: 'Eng Communication',  credits: 3, category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
    'ECE 325':  { title: 'EM Engineering',     credits: 3, category: 'ece_upper',offered: ['fall'], flags: [] },
    'ECE 339':  { title: 'Solid-State Devices', credits: 3, category: 'ece_upper',offered: ['spring'], flags: [] },
    'ECE 422C': { title: 'Software II',        credits: 3, category: 'ece_upper',offered: ['fall', 'spring'], flags: [] },
  },
  edges: [
    { from: 'M 408C',   to: 'M 408D',   type: 'prerequisite' },
    { from: 'M 408D',   to: 'M 427J',   type: 'prerequisite' },
    { from: 'M 408D',   to: 'M 340L',   type: 'prerequisite' },
    { from: 'M 408C',   to: 'ECE 302',  type: 'prerequisite' },
    { from: 'ECE 306',  to: 'ECE 312',  type: 'prerequisite' },
    { from: 'ECE 306',  to: 'ECE 319K', type: 'prerequisite' },
    { from: 'ECE 302',  to: 'ECE 411',  type: 'prerequisite' },
    { from: 'M 427J',   to: 'ECE 313',  type: 'prerequisite' },
    { from: 'ECE 411',  to: 'ECE 313',  type: 'prerequisite' },
    { from: 'ECE 319K', to: 'ECE 316',  type: 'prerequisite' },
    { from: 'ECE 312',  to: 'ECE 316',  type: 'prerequisite' },
    { from: 'ECE 316',  to: 'ECE 460N', type: 'prerequisite' },
    { from: 'ECE 312',  to: 'ECE 360C', type: 'prerequisite' },
    { from: 'ECE 312',  to: 'ECE 422C', type: 'prerequisite' },
    { from: 'ECE 319K', to: 'ECE 445L', type: 'prerequisite' },
    { from: 'ECE 302',  to: 'ECE 325',  type: 'prerequisite' },
    { from: 'M 427J',   to: 'ECE 325',  type: 'prerequisite' },
    { from: 'ECE 302',  to: 'ECE 339',  type: 'prerequisite' },
  ],
};

const testSemesters: Semester[] = [
  { id: 'Fall 2025',   label: "Fall '25", status: 'past',    year: 2025, season: 'Fall'   },
  { id: 'Spring 2026', label: "Sp '26",   status: 'current', year: 2026, season: 'Spring' },
  { id: 'Fall 2026',   label: "Fall '26", status: 'future',  year: 2026, season: 'Fall'   },
  { id: 'Spring 2027', label: "Sp '27",   status: 'future',  year: 2027, season: 'Spring' },
  { id: 'Fall 2027',   label: "Fall '27", status: 'future',  year: 2027, season: 'Fall'   },
  { id: 'Spring 2028', label: "Sp '28",   status: 'future',  year: 2028, season: 'Spring' },
  { id: 'Fall 2028',   label: "Fall '28", status: 'future',  year: 2028, season: 'Fall'   },
  { id: 'Spring 2029', label: "Sp '29",   status: 'future',  year: 2029, season: 'Spring' },
];

const testOffering: OfferingSchedule = {
  'ECE 325': {
    title: 'EM Engineering',
    offerings: { fall_25: true, spring_26: false, fall_26: true, spring_27: false },
    offered_semesters: ['fall'],
  },
  'ECE 339': {
    title: 'Solid-State Devices',
    offerings: { fall_25: false, spring_26: true, fall_26: false, spring_27: true },
    offered_semesters: ['spring'],
  },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generatePlan', () => {
  let prereqGraph: PrereqGraph;

  beforeEach(() => {
    // Pass empty CNF so tests exercise pure edge-based validation
    // (not the production authored CNF, which requires courses not in this mini-graph).
    prereqGraph = new PrereqGraph(mockGraphData, {});
  });

  it('generates a plan with no prereq violations', () => {
    const input: SolverInput = {
      completedCourses: ['M 408C', 'ECE 302', 'ECE 306', 'M 427J'],
      remainingRequirements: ['ECE 312', 'ECE 319K', 'ECE 411', 'ECE 313', 'ECE 316', 'ECE 460N', 'ECE 360C'],
      prereqGraph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters: testSemesters,
    };

    const result = generatePlan(input);
    expect(result.violations).toHaveLength(0);
    // All courses should be placed
    expect(result.unplacedCourses).toHaveLength(0);
  });

  it('respects offering patterns (fall-only courses in fall only)', () => {
    const input: SolverInput = {
      completedCourses: ['M 408C', 'ECE 302', 'M 427J'],
      remainingRequirements: ['ECE 325'],
      prereqGraph,
      offeringSchedule: testOffering,
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters: testSemesters,
    };

    const result = generatePlan(input);
    expect(result.violations).toHaveLength(0);
    expect(result.unplacedCourses).toHaveLength(0);

    // ECE 325 is fall-only — must be in a fall semester
    const placedInFall = testSemesters
      .filter((s) => s.season === 'Fall' && s.status === 'future')
      .some((s) => result.plan[s.id]?.includes('ECE 325'));

    const placedInSpring = testSemesters
      .filter((s) => s.season === 'Spring')
      .some((s) => result.plan[s.id]?.includes('ECE 325'));

    expect(placedInFall).toBe(true);
    expect(placedInSpring).toBe(false);
  });

  it('respects max hours per semester', () => {
    const input: SolverInput = {
      completedCourses: ['M 408C'],
      remainingRequirements: ['ECE 302', 'ECE 306', 'ECE 312', 'ECE 319K', 'ECE 411', 'ECE 313', 'M 427J', 'M 340L', 'M 408D'],
      prereqGraph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 12, // Tight limit
      semesters: testSemesters,
    };

    const result = generatePlan(input);

    // Check no future semester exceeds 12 hours
    for (const sem of testSemesters.filter((s) => s.status === 'future')) {
      expect(result.totalHours[sem.id] ?? 0).toBeLessThanOrEqual(12);
    }
  });

  it('includes pinned courses in specified semester', () => {
    const input: SolverInput = {
      completedCourses: ['M 408C', 'ECE 302', 'ECE 306'],
      remainingRequirements: ['ECE 312', 'ECE 319K', 'ECE 411'],
      prereqGraph,
      offeringSchedule: {},
      pinnedCourses: { 'ECE 411': 'Spring 2027' },
      maxHoursPerSemester: 18,
      semesters: testSemesters,
    };

    const result = generatePlan(input);
    expect(result.plan['Spring 2027']).toContain('ECE 411');
  });

  it('honors tech core selection (only includes specified courses)', () => {
    // This tests that the solver places only the courses it receives,
    // not that it determines which courses are needed (that's requirements.ts)
    const input: SolverInput = {
      completedCourses: ['M 408C', 'ECE 302', 'ECE 306', 'ECE 312', 'ECE 319K', 'M 427J'],
      remainingRequirements: ['ECE 316', 'ECE 460N', 'ECE 445L', 'ECE 360C', 'M 325K'],
      prereqGraph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters: testSemesters,
    };

    const result = generatePlan(input);
    expect(result.violations).toHaveLength(0);
    expect(result.unplacedCourses).toHaveLength(0);

    // All CA&ES tech core courses should be placed
    const allPlaced = Object.values(result.plan).flat();
    expect(allPlaced).toContain('ECE 316');
    expect(allPlaced).toContain('ECE 460N');
    expect(allPlaced).toContain('ECE 445L');
    expect(allPlaced).toContain('ECE 360C');
    expect(allPlaced).toContain('M 325K');
  });

  it('generates a complete plan for Adi profile', () => {
    // Adi's completed + in-progress courses
    // Include both honors AND standard equivalents so prereq edges resolve
    const adiCompleted = [
      'M 508M', 'M 411', 'RHE 306', 'M 408C', 'UGS 016',
      'ECE 302', 'ECE 306', 'CTI 301G', 'M 427J',
      'ECE 312H', 'ECE 312', // ECE 312H satisfies ECE 312
      'M 325K', 'CTI 302',
      'ECE 319H', 'ECE 319K', // ECE 319H satisfies ECE 319K
    ];

    // Subset of remaining requirements for a simpler test
    const remaining = [
      'ECE 411', 'ECE 313', 'ECE 316', 'ECE 460N',
      'ECE 360C', 'ECE 445L', 'ECE 351K', 'ECE 333T', 'ECE 422C',
    ];

    const input: SolverInput = {
      completedCourses: adiCompleted,
      remainingRequirements: remaining,
      prereqGraph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters: testSemesters,
    };

    const result = generatePlan(input);
    expect(result.violations).toHaveLength(0);
    expect(result.unplacedCourses).toHaveLength(0);
  });

  it('unplacedCourses is empty for a valid input', () => {
    const input: SolverInput = {
      completedCourses: ['M 408C', 'ECE 302', 'ECE 306', 'M 427J'],
      remainingRequirements: ['ECE 312', 'ECE 319K'],
      prereqGraph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters: testSemesters,
    };

    const result = generatePlan(input);
    expect(result.unplacedCourses).toHaveLength(0);
  });
});
