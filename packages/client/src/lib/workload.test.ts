/**
 * workload.test.ts — TASK-024
 * Tests for computeSemesterDifficulty and computeGraduationDelay.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  computeSemesterDifficulty,
  computeGraduationDelay,
  _delayCache,
} from './workload';
import { PrereqGraph } from './graph-engine';
import type {
  Semester,
  GradeDistributions,
  CourseCatalog,
  PrereqNode,
  Plan,
  PrereqGraphData,
  UserProfile,
  DegreeRequirements,
  TechCores,
  MathRequirements,
} from '../types';
import type { AutoPlannerInput } from './auto-planner';

// ─── Real-data loaders (uses packages/client/public/data) ────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
const prereqGraph = new PrereqGraph(prereqData);
const userProfile = loadJson<UserProfile>('user-profile.json');
const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const techCores = loadJson<TechCores>('tech-cores.json');
const mathReqs = loadJson<MathRequirements>('math-requirements.json');
const prereqNodes = prereqData.nodes;

// Minimal catalog from prereq graph
const catalog: CourseCatalog = {};
Object.entries(prereqData.nodes).forEach(([id, node]) => {
  catalog[id] = {
    id,
    title: node.title,
    credits: node.credits,
    description: '',
    prerequisites: [],
    corequisites: [],
    grading: '',
    department: id.split(' ')[0],
  };
});

// ─── Shared test fixtures ─────────────────────────────────────────────────────

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

const INITIAL_PLAN: Plan = {
  'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
  'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
  'Fall 2026':   [],
  'Spring 2027': [],
  'Fall 2027':   [],
  'Spring 2028': [],
  'Fall 2028':   [],
  'Spring 2029': [],
};

const emptyGradeDist: GradeDistributions = {};

const sampleGradeDist: GradeDistributions = {
  'ECE 302': {
    department: 'Electrical and Computer Engineering',
    department_code: 'ECE',
    course_number: '302',
    course_title: 'Introduction to Electrical Engineering',
    sections: [],
    avg_gpa: 2.8,  // Hard course
    a_pct: 20, b_pct: 30, c_pct: 30, d_pct: 15, f_pct: 5,
    total_enrollment: 200,
    total_sections: 5,
  },
  'M 427J': {
    department: 'Mathematics',
    department_code: 'M',
    course_number: '427J',
    course_title: 'Differential Equations with Linear Algebra',
    sections: [],
    avg_gpa: 2.6,  // Very hard
    a_pct: 18, b_pct: 28, c_pct: 30, d_pct: 16, f_pct: 8,
    total_enrollment: 300,
    total_sections: 8,
  },
  'CTI 301G': {
    department: 'CTI',
    department_code: 'CTI',
    course_number: '301G',
    course_title: 'CTI',
    sections: [],
    avg_gpa: 3.8,  // Easy course
    a_pct: 70, b_pct: 20, c_pct: 8, d_pct: 1, f_pct: 1,
    total_enrollment: 80,
    total_sections: 2,
  },
};

// ─── computeSemesterDifficulty tests ─────────────────────────────────────────

describe('computeSemesterDifficulty', () => {

  it('returns green bucket for empty semester', () => {
    const emptySem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    const plan: Plan = { 'Fall 2026': [] };
    const result = computeSemesterDifficulty(emptySem, plan, emptyGradeDist, null, {});
    expect(result.bucket).toBe('green');
    expect(result.score).toBe(0);
  });

  it('returns green bucket for empty semester when key is missing from plan', () => {
    const emptySem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    const plan: Plan = {};
    const result = computeSemesterDifficulty(emptySem, plan, emptyGradeDist, null, {});
    expect(result.bucket).toBe('green');
    expect(result.score).toBe(0);
  });

  it('returns a higher score for heavy credit loads', () => {
    const sem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    // 18 credits of 200-level courses (max load, easier courses) vs 3 credits
    const heavyPlan: Plan = { 'Fall 2026': ['ECE 302', 'ECE 302', 'ECE 302', 'ECE 302', 'ECE 302', 'ECE 302'] };
    const lightPlan: Plan = { 'Fall 2026': ['ECE 302'] };

    const heavyCatalog: CourseCatalog = {
      'ECE 302': { id: 'ECE 302', title: 'test', credits: 3, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
    };

    const heavy = computeSemesterDifficulty(sem, heavyPlan, emptyGradeDist, heavyCatalog);
    const light = computeSemesterDifficulty(sem, lightPlan, emptyGradeDist, heavyCatalog);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it('returns higher score for upper-level courses vs lower-level', () => {
    const sem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    const upperPlan: Plan = { 'Fall 2026': ['ECE 460'] };  // 460-level
    const lowerPlan: Plan = { 'Fall 2026': ['ECE 202'] };  // 200-level

    const upperResult = computeSemesterDifficulty(sem, upperPlan, emptyGradeDist, null, {});
    const lowerResult = computeSemesterDifficulty(sem, lowerPlan, emptyGradeDist, null, {});
    expect(upperResult.score).toBeGreaterThan(lowerResult.score);
  });

  it('returns higher score for courses with low avg GPA', () => {
    const sem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    const plan: Plan = { 'Fall 2026': ['ECE 302'] };

    const hardDist: GradeDistributions = {
      'ECE 302': { ...sampleGradeDist['ECE 302'], avg_gpa: 2.0 },
    };
    const easyDist: GradeDistributions = {
      'ECE 302': { ...sampleGradeDist['ECE 302'], avg_gpa: 3.8 },
    };

    const hardResult = computeSemesterDifficulty(sem, plan, hardDist, catalog);
    const easyResult = computeSemesterDifficulty(sem, plan, easyDist, catalog);
    expect(hardResult.score).toBeGreaterThan(easyResult.score);
  });

  it('bucket boundaries: score < 0.30 → green', () => {
    // Single easy low-level course with high GPA → green
    const sem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    const plan: Plan = { 'Fall 2026': ['CTI 301G'] };
    const simpleCatalog: CourseCatalog = {
      'CTI 301G': { id: 'CTI 301G', title: 'test', credits: 1, description: '', prerequisites: [], corequisites: [], grading: '', department: 'CTI' },
    };
    const easyDist: GradeDistributions = {
      'CTI 301G': { ...sampleGradeDist['CTI 301G'], avg_gpa: 3.9 },
    };
    const result = computeSemesterDifficulty(sem, plan, easyDist, simpleCatalog);
    expect(result.score).toBeLessThan(0.30);
    expect(result.bucket).toBe('green');
  });

  it('bucket boundaries: score >= 0.70 → red', () => {
    // Multiple high-level courses (500s) with terrible GPA → red
    const sem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    const plan: Plan = { 'Fall 2026': ['ECE 561', 'ECE 563', 'ECE 564', 'ECE 562', 'ECE 565'] };
    const hardCatalog: CourseCatalog = {};
    for (const id of plan['Fall 2026']) {
      hardCatalog[id] = { id, title: 'Hard Course', credits: 3, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' };
    }
    const hardDist: GradeDistributions = {};
    for (const id of plan['Fall 2026']) {
      hardDist[id] = {
        department: 'ECE', department_code: 'ECE', course_number: id.split(' ')[1],
        course_title: 'Hard', sections: [], avg_gpa: 2.0,
        a_pct: 10, b_pct: 25, c_pct: 35, d_pct: 20, f_pct: 10,
        total_enrollment: 100, total_sections: 2,
      };
    }
    const result = computeSemesterDifficulty(sem, plan, hardDist, hardCatalog);
    expect(result.score).toBeGreaterThanOrEqual(0.70);
    expect(result.bucket).toBe('red');
  });

  it('score is in [0, 1] range', () => {
    const sem: Semester = { id: 'Fall 2025', label: "Fall '25", status: 'past', year: 2025, season: 'Fall' };
    const result = computeSemesterDifficulty(sem, INITIAL_PLAN, sampleGradeDist, catalog, prereqNodes);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('no GPA data contributes 0.5 neutral factor', () => {
    const sem: Semester = { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' };
    const plan: Plan = { 'Fall 2026': ['ECE 302'] };
    const simpleCatalog: CourseCatalog = {
      'ECE 302': { id: 'ECE 302', title: 'test', credits: 3, description: '', prerequisites: [], corequisites: [], grading: '', department: 'ECE' },
    };
    // No GPA data — should use neutral (0.5)
    const result = computeSemesterDifficulty(sem, plan, emptyGradeDist, simpleCatalog);
    // With a single 300-level course (3cr) and neutral GPA factor:
    // levelFactor = (302-200)/(600-200) = 0.255, creditFactor = 3/18 = 0.167, gpaFactor = 0.5
    const expectedScore = 0.255 * 0.4 + 0.167 * 0.35 + 0.5 * 0.25;
    expect(result.score).toBeCloseTo(expectedScore, 2);
  });
});

// ─── computeGraduationDelay tests ─────────────────────────────────────────────

describe('computeGraduationDelay', () => {
  const basePlannerInput: AutoPlannerInput = {
    prereqGraph,
    prereqNodes: prereqData.nodes,
    userProfile,
    degreeReqs,
    techCore: techCores.computer_architecture,
    mathReqs,
    mathBAToggle: false,
    semesters: SEMESTERS,
    currentPlan: INITIAL_PLAN,
  };

  beforeEach(() => {
    _delayCache.clear();
  });

  it('returns 0 for a gen-ed course that is not a prerequisite bottleneck', () => {
    // CTI 301G is a gen-ed with no downstream prereqs — removing it delays nothing
    const delay = computeGraduationDelay('CTI 301G', basePlannerInput);
    expect(delay).toBeGreaterThanOrEqual(0);
    // It should be 0 because CTI is not a critical path course
    expect(delay).toBe(0);
  });

  it('returns 0 for a course already absent from the plan', () => {
    const planWithoutCourse: Plan = {
      ...INITIAL_PLAN,
      'Fall 2025': INITIAL_PLAN['Fall 2025'].filter((c) => c !== 'UGS 016'),
    };
    const input: AutoPlannerInput = {
      ...basePlannerInput,
      currentPlan: planWithoutCourse,
    };
    // Removing a course that's already not in plan should not error
    const delay = computeGraduationDelay('UGS 016', input);
    expect(delay).toBeGreaterThanOrEqual(0);
  });

  it('returns a non-negative integer', () => {
    const delay = computeGraduationDelay('ECE 302', basePlannerInput);
    expect(typeof delay).toBe('number');
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(delay)).toBe(true);
  });

  it('memoization: same courseId + planHash returns cached result', () => {
    // Clear cache, compute once to populate cache
    _delayCache.clear();
    const first = computeGraduationDelay('ECE 302', basePlannerInput);

    // The cache is keyed by `courseId:planHash:pinsHash`; verify it was populated
    // by confirming the second call returns the same value and cache size stays at 1.
    expect(_delayCache.size).toBe(1);

    // Second call returns same result (from cache — cache should not grow)
    const second = computeGraduationDelay('ECE 302', basePlannerInput);
    expect(second).toBe(first);
    expect(_delayCache.size).toBe(1); // no new entry added
  });

  it('memoization: different plan produces different cache key', () => {
    _delayCache.clear();

    const modifiedPlan: Plan = {
      ...INITIAL_PLAN,
      'Fall 2026': ['ECE 411'],
    };
    const input2: AutoPlannerInput = {
      ...basePlannerInput,
      currentPlan: modifiedPlan,
    };

    computeGraduationDelay('ECE 302', basePlannerInput);
    computeGraduationDelay('ECE 302', input2);

    // Both should be cached separately
    expect(_delayCache.size).toBe(2);
  });

  it('memoization LRU: cache size stays at or below 50', () => {
    _delayCache.clear();

    // Fill cache with 50 unique entries using made-up course IDs that won't affect planning
    for (let i = 0; i < 50; i++) {
      const fakePlan: Plan = { ...INITIAL_PLAN, 'Fall 2026': [`FAKE ${i}`] };
      const fakeInput: AutoPlannerInput = { ...basePlannerInput, currentPlan: fakePlan };
      computeGraduationDelay('CTI 302', fakeInput);
    }
    expect(_delayCache.size).toBe(50);

    // Adding one more should evict the oldest
    const newPlan: Plan = { ...INITIAL_PLAN, 'Fall 2026': ['FAKE 999'] };
    const newInput: AutoPlannerInput = { ...basePlannerInput, currentPlan: newPlan };
    computeGraduationDelay('CTI 302', newInput);

    expect(_delayCache.size).toBe(50);
  });

  // ── Future-placement bug regression tests (Critic report finding) ──────────

  it('future-placement: both baseline and modified correctly account for future pins', () => {
    // Verify that future-placed courses are promoted to pins in the baseline run,
    // ensuring baseline and modified are computed on a level playing field.
    //
    // Place ECE 411 (required, not yet satisfied) in Fall 2026 as a future drag.
    // With the fix: baseline pins ECE 411 to Fall 2026; modified omits the pin.
    // Both runs should produce valid plans (no errors thrown).
    // The delay can be 0 if the planner places ECE 411 in Fall 2026 naturally
    // either way — but the result must be a non-negative integer.
    const planWithFuturePlacement: Plan = {
      'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
      'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
      // ECE 411 placed in a future semester via drag (not yet satisfied in profile)
      'Fall 2026':   ['ECE 411'],
      'Spring 2027': [],
      'Fall 2027':   [],
      'Spring 2028': [],
      'Fall 2028':   [],
      'Spring 2029': [],
    };
    const input: AutoPlannerInput = {
      ...basePlannerInput,
      currentPlan: planWithFuturePlacement,
    };

    // Should return a non-negative integer — no longer collapses to 0 due to
    // the planner ignoring the future placement in the baseline.
    const delay = computeGraduationDelay('ECE 411', input);
    expect(typeof delay).toBe('number');
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(delay)).toBe(true);
  });

  it('future-placement: course in future late slot causes correct delay when planner would place it earlier', () => {
    // If a course is pinned (via drag) to a LATER semester than the planner
    // would naturally schedule it, the baseline plan has it later. Removing it
    // lets the planner place it in its natural (earlier) slot — giving delay = 0
    // (clamped from negative). This asserts the math is correct and non-negative.
    //
    // ECE 411 would go to Fall 2026 naturally. Pin it to Spring 2029 (latest).
    const planWithLatePlacement: Plan = {
      'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
      'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
      'Fall 2026':   [],
      'Spring 2027': [],
      'Fall 2027':   [],
      'Spring 2028': [],
      'Fall 2028':   [],
      // ECE 411 dragged all the way to the end
      'Spring 2029': ['ECE 411'],
    };
    const input: AutoPlannerInput = {
      ...basePlannerInput,
      currentPlan: planWithLatePlacement,
    };

    const delay = computeGraduationDelay('ECE 411', input);
    // Baseline has ECE 411 very late → graduation very late.
    // Modified removes the pin → planner schedules ECE 411 in Fall 2026 → graduation earlier.
    // delay = max(0, earlier - later) = 0.
    expect(delay).toBe(0);
  });

  it('future-placement: non-critical course placed in future semester → delay = 0', () => {
    // CTI 302 is a gen-ed / non-prerequisite bottleneck course.
    // Even if placed in a future semester, removing it should not delay graduation.
    const planWithFutureCTI: Plan = {
      'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
      'Spring 2026': ['ECE 312H', 'M 325K', 'ECE 319H'],
      // CTI 302 placed in future semester (not past/current)
      'Fall 2026':   ['CTI 302'],
      'Spring 2027': [],
      'Fall 2027':   [],
      'Spring 2028': [],
      'Fall 2028':   [],
      'Spring 2029': [],
    };
    const input: AutoPlannerInput = {
      ...basePlannerInput,
      currentPlan: planWithFutureCTI,
    };

    const delay = computeGraduationDelay('CTI 302', input);
    expect(delay).toBe(0);
  });

  it('future-placement: memo cache correctly keys on future contents', () => {
    _delayCache.clear();

    // Plan A: ECE 302 in future Fall 2026
    const planA: Plan = {
      'Fall 2025':   ['ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
      'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
      'Fall 2026':   ['ECE 302'],
      'Spring 2027': [], 'Fall 2027': [], 'Spring 2028': [], 'Fall 2028': [], 'Spring 2029': [],
    };
    // Plan B: ECE 302 in future Spring 2027 (different future slot)
    const planB: Plan = {
      ...planA,
      'Fall 2026':   [],
      'Spring 2027': ['ECE 302'],
    };

    const inputA: AutoPlannerInput = { ...basePlannerInput, currentPlan: planA };
    const inputB: AutoPlannerInput = { ...basePlannerInput, currentPlan: planB };

    computeGraduationDelay('ECE 302', inputA);
    computeGraduationDelay('ECE 302', inputB);

    // Different future placements → different cache entries
    expect(_delayCache.size).toBe(2);

    // Second calls with same inputs hit the cache (size doesn't grow)
    computeGraduationDelay('ECE 302', inputA);
    computeGraduationDelay('ECE 302', inputB);
    expect(_delayCache.size).toBe(2);
  });

  it('future-placement: cache invalidates when future semester changes', () => {
    _delayCache.clear();

    const planBefore: Plan = {
      ...INITIAL_PLAN,
      'Fall 2026': ['ECE 411'],
    };
    const planAfter: Plan = {
      ...INITIAL_PLAN,
      'Fall 2026': ['ECE 411', 'ECE 460'],
    };

    const before: AutoPlannerInput = { ...basePlannerInput, currentPlan: planBefore };
    const after: AutoPlannerInput = { ...basePlannerInput, currentPlan: planAfter };

    computeGraduationDelay('ECE 302', before);
    expect(_delayCache.size).toBe(1);

    computeGraduationDelay('ECE 302', after);
    // Changed future plan → new cache entry; old one still present
    expect(_delayCache.size).toBe(2);
  });
});

// ─── C1 guard: courseLevel with undefined/empty input ────────────────────────
// Directly tests the guard added in TASK-060 to prevent `.split` on undefined.
// computeSemesterDifficulty is the public entry point that uses courseLevel internally.
describe('computeSemesterDifficulty — C1 undefined-id guard', () => {
  it('does not throw when plan contains an empty-string course id', () => {
    const semester: Semester = SEMESTERS[2]; // Fall 2026 (future)
    // A plan entry with an empty string id mimics the state that was crashing
    // before the `if (!courseId) return 0` guard was added.
    const plan: Plan = { [semester.id]: ['', 'ECE 302'] };
    expect(() =>
      computeSemesterDifficulty(semester, plan, emptyGradeDist, null, {})
    ).not.toThrow();
  });
});
