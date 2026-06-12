/**
 * task-063.test.ts
 *
 * Integration + unit tests for TASK-063 correctness fixes:
 *   H1 — Solver uses CNF OR-group prereqs (not flat AND)
 *   H3 — Recommend counts only unpinned courses; extra future courses are reported
 *
 * Acceptance criteria (from the plan):
 *   1. Real generatePlan for software_engineering profile places ECE 464K + ECE 364D
 *   2. Synthetic OR-group: a course with 3-option OR prereq is placeable when exactly ONE
 *      option is in the plan (would fail under old flat-AND logic)
 *   3. H3: silently-dropped course count — futureCoursesBefore vs futureCoursesAfter logic
 *      and futureCourseCount excludes pinned entries
 *   4. No regression on existing solver behavior
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generatePlan } from './solver';
import { generateAutoPlan } from './auto-planner';
import { addWithVariants } from './variants';
import { PrereqGraph } from './graph-engine';
import type {
  PrereqGraphData,
  DegreeRequirements,
  TechCores,
  MathRequirements,
  UserProfile,
  Semester,
  Plan,
  OfferingSchedule,
  CourseCatalog,
} from '../types';

// ─── Real data ────────────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const techCores = loadJson<TechCores>('tech-cores.json');
const mathReqs = loadJson<MathRequirements>('math-requirements.json');
const offeringSchedule = loadJson<OfferingSchedule>('offering-schedule.json');
const baseProfile = loadJson<UserProfile>('user-profile.json');
const catalog = loadJson<CourseCatalog>('course-catalog.json');

// Real graph using production PREREQ_CNF (default — no override)
const realGraph = new PrereqGraph(prereqData);

const SEMESTERS: Semester[] = [
  { id: 'Fall 2025',   label: "Fall '25", status: 'past',    year: 2025, season: 'Fall'   },
  { id: 'Spring 2026', label: "Sp '26",   status: 'current', year: 2026, season: 'Spring' },
  { id: 'Fall 2026',   label: "Fall '26", status: 'future',  year: 2026, season: 'Fall'   },
  { id: 'Spring 2027', label: "Sp '27",   status: 'future',  year: 2027, season: 'Spring' },
  { id: 'Fall 2027',   label: "Fall '27", status: 'future',  year: 2027, season: 'Fall'   },
  { id: 'Spring 2028', label: "Sp '28",   status: 'future',  year: 2028, season: 'Spring' },
  { id: 'Fall 2028',   label: "Fall '28", status: 'future',  year: 2028, season: 'Fall'   },
  { id: 'Spring 2029', label: "Sp '29",   status: 'future',  year: 2029, season: 'Spring' },
];

const BASE_PLAN: Plan = {
  'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
  'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
  'Fall 2026':   [],
  'Spring 2027': [],
  'Fall 2027':   [],
  'Spring 2028': [],
  'Fall 2028':   [],
  'Spring 2029': [],
};

// A typical software_engineering profile: use the real profile with load_tolerance = normal
const SWE_PROFILE: UserProfile = {
  ...baseProfile,
  preferences: {
    ...baseProfile.preferences,
    course_load_tolerance: 'normal',
  },
};

// ─── H1: ECE 464K and ECE 364D are placed by the solver ──────────────────────

describe('H1 — OR-group prereq correctness (real data)', () => {
  it('generateAutoPlan for software_engineering places ECE 464K and ECE 364D', () => {
    const result = generateAutoPlan({
      prereqGraph: realGraph,
      offeringSchedule,
      userProfile: SWE_PROFILE,
      degreeReqs,
      techCore: techCores.software_engineering,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: BASE_PLAN,
      catalog,
    });

    const futureCourses = SEMESTERS
      .filter(s => s.status === 'future')
      .flatMap(s => result.plan[s.id] ?? []);

    // ECE 464K and ECE 364D must appear in the plan, NOT in unplacedCourses
    expect(result.unplacedCourses).not.toContain('ECE 464K');
    expect(result.unplacedCourses).not.toContain('ECE 364D');
    expect(futureCourses).toContain('ECE 464K');
    expect(futureCourses).toContain('ECE 364D');
  });

  // Theme H (item 1): the production correctness contract — zero prereq violations
  // under the AUTHORED PREREQ_CNF — was only ever asserted against an empty-CNF mock
  // graph (solver.test.ts). generateAutoPlan drops the violations its internal
  // generatePlan computes, so we re-validate the produced plan against the real graph.
  // This fails if a future change (mistyped AND-stack, renamed slot, regressed
  // OR-group eval) lets the solver place a course before its real prerequisites.
  it('places courses with ZERO prereq violations under the real authored CNF', () => {
    const result = generateAutoPlan({
      prereqGraph: realGraph,
      offeringSchedule,
      userProfile: SWE_PROFILE,
      degreeReqs,
      techCore: techCores.software_engineering,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: BASE_PLAN,
      catalog,
    });

    // Rebuild the same variant-expanded "already taken" set generatePlan builds
    // internally (completed + in-progress, expanded to honors/legacy/transfer forms).
    const completedSet = new Set<string>();
    for (const c of SWE_PROFILE.completed_courses) addWithVariants(completedSet, c.course, degreeReqs);
    for (const c of SWE_PROFILE.in_progress_courses) addWithVariants(completedSet, c.course, degreeReqs);

    const semesterOrder = SEMESTERS.map((s) => s.id);

    // Validate the whole plan against PREREQ_CNF, then keep only violations on
    // solver-placed (future) courses — past/current placements are transcript.
    const violations = realGraph
      .validatePlan(result.plan, semesterOrder, completedSet)
      .filter((v) => {
        const sem = SEMESTERS.find((s) => s.id === v.semesterId);
        return sem?.status === 'future';
      });

    expect(violations).toEqual([]);
  });
});

// ─── H1: Synthetic OR-group test ─────────────────────────────────────────────

describe('H1 — Synthetic OR-group prereq (unit test)', () => {
  /**
   * Build a tiny graph:
   *   OPT_A, OPT_B, OPT_C — three alternatives
   *   CAPSTONE — has 3-option OR prereq: needs (OPT_A OR OPT_B OR OPT_C)
   *
   * Under old flat-AND: ALL three must be satisfied → CAPSTONE unplaceable with only OPT_A.
   * Under CNF OR-group (fix): ANY one satisfies → CAPSTONE placeable with only OPT_A.
   */
  const syntheticData: PrereqGraphData = {
    nodes: {
      'OPT_A': { title: 'Option A', category: 'ece_upper', flags: [] },
      'OPT_B': { title: 'Option B', category: 'ece_upper', flags: [] },
      'OPT_C': { title: 'Option C', category: 'ece_upper', flags: [] },
      'CAPSTONE': { title: 'Capstone', category: 'ece_upper', flags: [] },
    },
    edges: [
      { from: 'OPT_A', to: 'CAPSTONE', type: 'prerequisite' },
      { from: 'OPT_B', to: 'CAPSTONE', type: 'prerequisite' },
      { from: 'OPT_C', to: 'CAPSTONE', type: 'prerequisite' },
    ],
  };

  const semesters: Semester[] = [
    { id: 'Sem1', label: 'Sem1', status: 'future', year: 2026, season: 'Fall' },
    { id: 'Sem2', label: 'Sem2', status: 'future', year: 2027, season: 'Spring' },
    { id: 'Sem3', label: 'Sem3', status: 'future', year: 2027, season: 'Fall' },
  ];

  it('CAPSTONE is placeable when exactly ONE of three OR-group options is completed', () => {
    // Only OPT_A is completed — under old flat-AND this would mean CAPSTONE is unplaceable.
    // With the CNF OR-group fix, OPT_A satisfies the single one_of group.
    const graph = new PrereqGraph(syntheticData); // uses production CNF (default-OR fallback)

    const result = generatePlan({
      completedCourses: ['OPT_A'],
      remainingRequirements: ['CAPSTONE'],
      prereqGraph: graph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters,
      catalog,
    });

    expect(result.unplacedCourses).not.toContain('CAPSTONE');
    const allPlaced = Object.values(result.plan).flat();
    expect(allPlaced).toContain('CAPSTONE');
    expect(result.violations).toHaveLength(0);
  });

  it('CAPSTONE is UNplaceable when none of the OR-group options are satisfied', () => {
    // None of OPT_A/B/C completed or in remainingRequirements → genuinely unplaceable
    const graph = new PrereqGraph(syntheticData);

    const result = generatePlan({
      completedCourses: [],
      remainingRequirements: ['CAPSTONE'],
      prereqGraph: graph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters,
      catalog,
    });

    expect(result.unplacedCourses).toContain('CAPSTONE');
  });

  it('CAPSTONE is placeable when ONE option is placed in an earlier semester (plan-based)', () => {
    // OPT_A is not completed but IS being placed in the same solver run (earlier semester)
    const graph = new PrereqGraph(syntheticData);

    const result = generatePlan({
      completedCourses: [],
      remainingRequirements: ['OPT_A', 'CAPSTONE'],
      prereqGraph: graph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters,
      catalog,
    });

    expect(result.unplacedCourses).not.toContain('OPT_A');
    expect(result.unplacedCourses).not.toContain('CAPSTONE');
    // OPT_A must be in an earlier semester than CAPSTONE
    const optAIdx = semesters.findIndex(s => result.plan[s.id]?.includes('OPT_A'));
    const capstoneIdx = semesters.findIndex(s => result.plan[s.id]?.includes('CAPSTONE'));
    expect(optAIdx).toBeGreaterThanOrEqual(0);
    expect(capstoneIdx).toBeGreaterThanOrEqual(0);
    expect(optAIdx).toBeLessThan(capstoneIdx);
  });
});

// ─── H3: futureCourseCount excludes pinned courses ────────────────────────────

describe('H3 — futureCourseCount excludes pinned courses (unit)', () => {
  /**
   * Test the filtering logic directly (without mounting React hooks).
   * The logic in useRecommendPlan counts only courses NOT in pinnedCourses.
   */
  it('counts only unpinned future courses', () => {
    const futureSems = ['Sem1', 'Sem2'];
    const plan: Record<string, string[]> = {
      'Sem1': ['ECE 460N', 'ECE 445L', 'ECE 316'],  // 2 pinned, 1 unpinned
      'Sem2': ['ECE 422C', 'ECE 360C'],              // both unpinned
    };
    const pinnedCourses = ['ECE 460N', 'ECE 445L'];

    const pinnedSet = new Set(pinnedCourses);
    const courses = futureSems.reduce(
      (sum, s) => sum + (plan[s] ?? []).filter(id => !pinnedSet.has(id)).length,
      0
    );

    // 1 unpinned in Sem1 + 2 unpinned in Sem2 = 3 total (not 5)
    expect(courses).toBe(3);
  });

  it('counts all when no courses are pinned', () => {
    const futureSems = ['Sem1'];
    const plan: Record<string, string[]> = { 'Sem1': ['ECE 460N', 'ECE 445L'] };
    const pinnedCourses: string[] = [];

    const pinnedSet = new Set(pinnedCourses);
    const courses = futureSems.reduce(
      (sum, s) => sum + (plan[s] ?? []).filter(id => !pinnedSet.has(id)).length,
      0
    );

    expect(courses).toBe(2);
  });
});

// ─── H3: silently-dropped course detection logic ──────────────────────────────

describe('H3 — silently-dropped future course detection (unit)', () => {
  it('detects courses that were in future semesters before but absent after', () => {
    const futureSemIds = ['Fall 2026', 'Spring 2027'];

    const planBefore: Record<string, string[]> = {
      'Fall 2026':   ['ECE 460N', 'MY_ELECTIVE_999'],
      'Spring 2027': ['ECE 445L'],
    };
    const planAfter: Record<string, string[]> = {
      'Fall 2026':   ['ECE 460N', 'ECE 316'],  // MY_ELECTIVE_999 replaced, not surfaced
      'Spring 2027': ['ECE 445L', 'ECE 422C'],
    };
    const pinnedCourses: string[] = [];
    const pinnedSet = new Set(pinnedCourses);
    const unplacedFromSolver: string[] = [];  // solver doesn't know about MY_ELECTIVE_999

    const futureCoursesBefore = new Set(
      futureSemIds.flatMap(s => (planBefore[s] ?? []).filter(id => !pinnedSet.has(id)))
    );
    const futureCoursesAfter = new Set(
      futureSemIds.flatMap(s => planAfter[s] ?? [])
    );
    const silentlyDropped = Array.from(futureCoursesBefore).filter(
      id => !futureCoursesAfter.has(id) && !unplacedFromSolver.includes(id)
    );

    // MY_ELECTIVE_999 was in the plan before, not in the plan after, not in unplaced
    expect(silentlyDropped).toContain('MY_ELECTIVE_999');
    // ECE 460N was re-placed so it is NOT silently dropped
    expect(silentlyDropped).not.toContain('ECE 460N');
  });

  it('does not double-report courses already in unplacedCourses', () => {
    const futureSemIds = ['Fall 2026'];
    const planBefore: Record<string, string[]> = { 'Fall 2026': ['ECE_HARD_999'] };
    const planAfter: Record<string, string[]>  = { 'Fall 2026': [] };
    const pinnedCourses: string[] = [];
    const pinnedSet = new Set(pinnedCourses);
    const unplacedFromSolver = ['ECE_HARD_999'];  // solver already reports it

    const futureCoursesBefore = new Set(
      futureSemIds.flatMap(s => (planBefore[s] ?? []).filter(id => !pinnedSet.has(id)))
    );
    const futureCoursesAfter = new Set(
      futureSemIds.flatMap(s => planAfter[s] ?? [])
    );
    const silentlyDropped = Array.from(futureCoursesBefore).filter(
      id => !futureCoursesAfter.has(id) && !unplacedFromSolver.includes(id)
    );

    // ECE_HARD_999 is already in unplacedCourses — should not appear again
    expect(silentlyDropped).not.toContain('ECE_HARD_999');
  });
});

// ─── Regression: existing OR-safe courses still place correctly ───────────────

describe('H1 regression — OR-group fix does not break ECE 411 (AND-stack)', () => {
  /**
   * ECE 411 is in PREREQ_CNF as an AND-stack:
   *   needs (ECE 302 OR ECE 302H) AND (M 427J) AND (PHY 303L)
   * After the fix, ECE 411 must still be unplaceable if only ECE 302 is completed
   * (PHY 303L and M 427J both missing).
   */
  it('ECE 411 requires all CNF groups — still unplaceable with partial prereqs', () => {
    const semesters: Semester[] = [
      { id: 'Sem1', label: 'Sem1', status: 'future', year: 2026, season: 'Fall' },
    ];

    const result = generatePlan({
      // Only ECE 302 satisfied — PHY 303L and M 427J missing
      completedCourses: ['ECE 302'],
      remainingRequirements: ['ECE 411'],
      prereqGraph: realGraph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters,
      catalog,
    });

    expect(result.unplacedCourses).toContain('ECE 411');
  });

  it('ECE 411 is placeable when all three CNF groups are satisfied', () => {
    const semesters: Semester[] = [
      { id: 'Sem1', label: 'Sem1', status: 'future', year: 2026, season: 'Fall' },
    ];

    const result = generatePlan({
      completedCourses: ['ECE 302', 'M 427J', 'PHY 303L'],
      remainingRequirements: ['ECE 411'],
      prereqGraph: realGraph,
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 18,
      semesters,
      catalog,
    });

    expect(result.unplacedCourses).not.toContain('ECE 411');
    expect(Object.values(result.plan).flat()).toContain('ECE 411');
  });
});
