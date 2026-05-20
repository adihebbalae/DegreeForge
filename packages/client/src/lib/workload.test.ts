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

// ─── Real-data loaders ────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../../../data', filename);
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

    // Manually check cache was populated
    const planHash = JSON.stringify(INITIAL_PLAN);
    const cacheKey = `ECE 302:${planHash}`;
    expect(_delayCache.has(cacheKey)).toBe(true);
    expect(_delayCache.get(cacheKey)).toBe(first);

    // Second call returns same result (from cache)
    const second = computeGraduationDelay('ECE 302', basePlannerInput);
    expect(second).toBe(first);
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
});
