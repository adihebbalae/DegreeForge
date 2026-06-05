import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateAutoPlan } from './auto-planner';
import { PrereqGraph } from './graph-engine';
import type {
  UserProfile,
  DegreeRequirements,
  TechCores,
  MathRequirements,
  PrereqGraphData,
  Semester,
  Plan,
  CourseCatalog,
} from '../types';

// ─── Real data loader (uses packages/client/public/data) ─────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const profile = loadJson<UserProfile>('user-profile.json');
const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const techCores = loadJson<TechCores>('tech-cores.json');
const mathReqs = loadJson<MathRequirements>('math-requirements.json');
const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
const prereqGraph = new PrereqGraph(prereqData);

// Minimal catalog from prereq nodes (real catalog has more — not needed for solver)
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateAutoPlan', () => {
  it('preserves past + current semesters and fills future ones with content', () => {
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });

    // Past + current preserved exactly
    expect(result.plan['Fall 2025']).toEqual(INITIAL_PLAN['Fall 2025']);
    expect(result.plan['Spring 2026']).toEqual(INITIAL_PLAN['Spring 2026']);

    // Future semesters fill with substantial content
    const futureCount =
      result.plan['Fall 2026'].length +
      result.plan['Spring 2027'].length +
      result.plan['Fall 2027'].length +
      result.plan['Spring 2028'].length +
      result.plan['Fall 2028'].length +
      result.plan['Spring 2029'].length;
    expect(futureCount).toBeGreaterThan(10);
  });

  it('respects offering pattern — fall-only courses never appear in spring', () => {
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });

    for (const sem of SEMESTERS.filter((s) => s.status === 'future')) {
      const seasonLower = sem.season.toLowerCase();
      for (const courseId of result.plan[sem.id]) {
        const node = prereqData.nodes[courseId];
        if (node?.offered && node.offered.length > 0) {
          expect(node.offered).toContain(seasonLower);
        }
      }
    }
  });

  it('respects load_tolerance (above_average -> max 18 credit-hours per future semester)', () => {
    // Behavior B: load cap is now credit-hours (18 for above_average), not course count.
    // The old assertion (≤ 5 courses) was the course-count cap; the new policy caps by
    // credit hours so 6 three-credit courses (18 hrs) is valid — 7 would not be.
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });
    for (const sem of SEMESTERS.filter((s) => s.status === 'future')) {
      const semCredits = result.plan[sem.id].reduce(
        (sum, id) => sum + (prereqData.nodes[id]?.credits ?? 3),
        0
      );
      // 18 = credit-hour cap for above_average load tolerance (Behavior B)
      expect(semCredits).toBeLessThanOrEqual(18);
    }
  });

  it('honors explicit credit-hour override via maxHoursPerSemesterOverride', () => {
    // maxHoursPerSemesterOverride caps credit hours per future semester.
    // Setting it to 12 means at most 12 credit hours per future semester.
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
      maxHoursPerSemesterOverride: 12,
    });
    for (const sem of SEMESTERS.filter((s) => s.status === 'future')) {
      const semCredits = result.plan[sem.id].reduce(
        (sum, id) => sum + (prereqData.nodes[id]?.credits ?? 3),
        0
      );
      // 12 = the credit-hour override we passed in
      expect(semCredits).toBeLessThanOrEqual(12);
    }
  });

  it('does not re-add courses Adi already completed (ECE 402/406/412/419K)', () => {
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });
    const futureCourses = SEMESTERS.filter((s) => s.status === 'future').flatMap(
      (s) => result.plan[s.id]
    );
    // ECE 312H -> satisfies ECE 412; ECE 319H -> satisfies ECE 419K;
    // ECE 302 -> ECE 402; ECE 306 -> ECE 406.
    expect(futureCourses).not.toContain('ECE 402');
    expect(futureCourses).not.toContain('ECE 406');
    expect(futureCourses).not.toContain('ECE 412');
    expect(futureCourses).not.toContain('ECE 419K');
  });

  it('places tech-core required courses for the chosen track', () => {
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });
    const futureCourses = SEMESTERS.filter((s) => s.status === 'future').flatMap(
      (s) => result.plan[s.id]
    );
    // Comp Arch required core: ECE 316 + ECE 460N + ECE 445L (core lab) + ECE 360C (required elective)
    expect(futureCourses).toContain('ECE 316');
    expect(futureCourses).toContain('ECE 460N');
    expect(futureCourses).toContain('ECE 445L');
    expect(futureCourses).toContain('ECE 360C');
  });

  it('switches tech-core required courses when track changes', () => {
    const sweResult = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.software_engineering,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });
    const swe = SEMESTERS.filter((s) => s.status === 'future').flatMap(
      (s) => sweResult.plan[s.id]
    );
    // SWE required: ECE 422C + ECE 360C + ECE 461L
    expect(swe).toContain('ECE 422C');
    expect(swe).toContain('ECE 360C');
    expect(swe).toContain('ECE 461L');
    // ECE 460N is comp-arch core, not SWE — should NOT be auto-placed
    expect(swe).not.toContain('ECE 460N');
  });

  it('includes Math BA additional courses when toggle is on', () => {
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: true,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });
    const futureCourses = SEMESTERS.filter((s) => s.status === 'future').flatMap(
      (s) => result.plan[s.id]
    );
    // Math BA breakdown examples include M 325K (already done), M 361K, M 362K, M 374M
    expect(futureCourses.some((c) => c === 'M 361K' || c === 'M 362K' || c === 'M 374M')).toBe(true);
  });

  it('places pinned courses in their pinned semester', () => {
    const result = generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      pinnedCourses: { 'ECE 460N': 'Fall 2027' },
      catalog,
    });
    expect(result.plan['Fall 2027']).toContain('ECE 460N');
    // Should not appear in any other future semester
    const otherFuture = ['Fall 2026', 'Spring 2027', 'Spring 2028', 'Fall 2028', 'Spring 2029'];
    for (const id of otherFuture) {
      expect(result.plan[id]).not.toContain('ECE 460N');
    }
  });

  it('completes a 4-year plan in under 200ms', () => {
    const start = performance.now();
    generateAutoPlan({
      prereqGraph,
      prereqNodes: prereqData.nodes,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan: INITIAL_PLAN,
      catalog,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

});
