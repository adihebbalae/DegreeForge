/**
 * Integration tests — Full planner flow
 *
 * These tests exercise the business-logic layer end-to-end (data → plan →
 * validation → progress → what-if → scheduler) without mounting a browser
 * DOM.  They test exactly the same logic that backs each UI feature.
 *
 * Covers all 7 flows from the handoff spec:
 *  1. Loads Adi profile data on startup
 *  2. Displays completed courses in Fall 2025 and Spring 2026
 *  3. Dragging a course from palette to empty semester updates progress bars
 *  4. Adding a course with unmet prereqs shows red border
 *  5. What-if: switching tech core updates palette contents
 *  6. Export plan → clear → import plan → plan is restored
 *  7. V2: selecting courses and optimizing returns conflict-free schedules
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ── Business-logic imports ────────────────────────────────────────────────────
import { planReducer, historyReducer, INITIAL_STATE, INITIAL_PLAN, DEMO_PLAN, SEMESTERS } from '../context/PlanContext';
import { PrereqGraph } from '../lib/graph-engine';
import { computeProgress } from '../lib/progress';
import { computeWhatIfDiff } from '../lib/what-if';
import { generateSchedules } from '../lib/scheduler';
import { normalizeGradeDistributions } from '../lib/normalize';

// ── Types ─────────────────────────────────────────────────────────────────────
import type {
  PlanState,
  PrereqGraphData,
  CourseCatalog,
  DegreeRequirements,
  TechCoreTrack,
  UserProfile,
  MathRequirements,
  CourseSections,
} from '../types';

// ─── Shared mock data (minimal but realistic) ─────────────────────────────────

const mockCatalog: CourseCatalog = {
  'ECE 302':  { id: 'ECE 302',  title: 'Intro to EE',           credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 306':  { id: 'ECE 306',  title: 'Intro to Computing',     credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 312H': { id: 'ECE 312H', title: 'Software I Honors',      credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 319H': { id: 'ECE 319H', title: 'Embedded Systems Honors',credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 316':  { id: 'ECE 316',  title: 'Digital Logic Design',   credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 460N': { id: 'ECE 460N', title: 'Computer Architecture',  credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 445L': { id: 'ECE 445L', title: 'Embedded Systems Lab',   credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 360C': { id: 'ECE 360C', title: 'Algorithms',             credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 411':  { id: 'ECE 411',  title: 'Circuit Theory',         credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 313':  { id: 'ECE 313',  title: 'Signals and Systems',    credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'ECE 422C': { id: 'ECE 422C', title: 'Software II',            credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'M 325K':   { id: 'M 325K',   title: 'Discrete Math',          credits: 3, department: 'M',   description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'M 427J':   { id: 'M 427J',   title: 'Diff Eq',                credits: 4, department: 'M',   description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'CTI 301G': { id: 'CTI 301G', title: 'Ancient Greece',         credits: 3, department: 'CTI', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'CTI 302':  { id: 'CTI 302',  title: 'Social Thought',         credits: 3, department: 'CTI', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  'UGS 016':  { id: 'UGS 016',  title: 'First Year Seminar',     credits: 0, department: 'UGS', description: '', prerequisites: [], corequisites: [], grading: 'pass_fail' },
};

const mockPrereqNodes: PrereqGraphData['nodes'] = {
  'ECE 302':  { title: 'Intro to EE',           credits: 3, category: 'ece_lower', offered: ['fall'], flags: [] },
  'ECE 306':  { title: 'Intro to Computing',     credits: 3, category: 'ece_lower', offered: ['fall'], flags: [] },
  'ECE 312H': { title: 'Software I Honors',      credits: 3, category: 'ece_core',  offered: ['spring'], flags: [] },
  'ECE 319H': { title: 'Embedded Systems Honors',credits: 3, category: 'ece_core',  offered: ['spring'], flags: [] },
  'ECE 316':  { title: 'Digital Logic Design',   credits: 3, category: 'ece_upper', offered: ['fall'], flags: [] },
  'ECE 460N': { title: 'Computer Architecture',  credits: 4, category: 'ece_upper', offered: ['fall'], flags: [] },
};

const mockDegreeReqs: DegreeRequirements = {
  ece_core: {
    courses: ['ECE 402', 'ECE 406', 'ECE 419K', 'ECE 411', 'ECE 412', 'ECE 313'],
    notes: '',
    honors_variants: { 'ECE 412': 'ECE 312H', 'ECE 419K': 'ECE 319H', 'ECE 402': 'ECE 302H' },
    senior_design_options: [],
  },
  core_curriculum: {
    slots: [
      { id: 'vapa',      label: 'VAPA',      hours: 3, core_code: '050', options: ['list_of_approved'], ap_eligible: true },
      { id: 'humanities',label: 'Humanities', hours: 3, core_code: '040', options: ['list_of_approved'], ap_eligible: true },
    ],
  },
  tech_core:           { description: '', components: { advanced_math: { hours: '3', count: 1 }, core_courses: { hours: '6', count: 2 }, core_lab: { hours: '4', count: 1 }, tech_electives: { hours_min: 12, count: '3' } }, notes: '' },
  advanced_tech_elective: { count: 1, hours: '3', description: '' },
  free_electives:      { total_hours: 14, constraints: [], approved_list_url: '' },
  math_sequence:       { required: [], alternate_calculus: [], notes: '' },
  physics_sequence:    { required: [], alternate: [], notes: '' },
  total_credit_hours:  128,
  notes: '',
};

const mockTechCore: TechCoreTrack = {
  name: 'Computer Architecture & Embedded Systems',
  graduate_track: '',
  category: 'CE',
  required_math: 'M 325K',
  required_courses: {
    advanced_math:     { id: 'M 325K',   title: 'Discrete Math' },
    core:              [{ id: 'ECE 316', title: 'Digital Logic' }, { id: 'ECE 460N', title: 'Comp Arch' }],
    core_lab:          { id: 'ECE 445L', title: 'Embedded Lab' },
    required_elective: { id: 'ECE 360C', title: 'Algorithms' },
  },
  elective_count: { general: 3, ecb: 2 },
  elective_pool: ['ECE 422C'],
};

/** Adi's profile — matches real user-profile.json structure */
const mockProfile: UserProfile = {
  name: 'Adi Shastri',
  eid: 'as123456',
  university: 'UT Austin',
  catalog_year: '2025-2026',
  major: 'ECE BSECE',
  classification: 'Sophomore',
  first_semester: 'Fall 2025',
  graduation_target: 'Spring 2029',
  tech_core: { declared: 'Computer Architecture & Embedded Systems', status: 'declared', required_math: 'M 325K', required_ece: [], tech_electives_needed: 3 },
  secondary_aspirations: { math_ba: { status: 'considering', notes: '' }, advanced_math_cert: { status: '', notes: '' }, jefferson_scholars_cert: { status: '', notes: '' } },
  preferences: { course_load: 'moderate', course_load_tolerance: 'up_to_18', time_preference: 'morning', summer_courses: false, summer_notes: '' },
  gpa: { cumulative: 3.96, lower_division: 3.96, upper_division: 0, gpa_hours: 14, grade_points: 55.44 },
  credit_summary: { total_hours_transferred: 12, total_hours_taken: 14, total_hours: 26 },
  completed_courses: [
    { course: 'ECE 302',  title: 'Intro to EE',           grade: 'A',  semester: 'Fall 2025',   type: 'lecture', credit_hours: 3 },
    { course: 'ECE 306',  title: 'Intro to Computing',    grade: 'A',  semester: 'Fall 2025',   type: 'lecture', credit_hours: 3 },
    { course: 'CTI 301G', title: 'Ancient Greece',        grade: 'A+', semester: 'Fall 2025',   type: 'lecture', credit_hours: 3 },
    { course: 'M 427J',   title: 'Diff Eq',               grade: 'A',  semester: 'Fall 2025',   type: 'lecture', credit_hours: 4 },
    { course: 'UGS 016',  title: 'First Year Seminar',    grade: 'CR', semester: 'Fall 2025',   type: 'seminar', credit_hours: 0 },
    { course: 'RHE 306',  title: 'Rhetoric',              grade: 'CR', semester: 'prior',       type: 'exam',    credit_hours: 3 },
  ],
  in_progress_courses: [
    { course: 'ECE 312H', title: 'Software I Honors',      semester: 'Spring 2026', credit_hours: 3 },
    { course: 'M 325K',   title: 'Discrete Math',          semester: 'Spring 2026', credit_hours: 3 },
    { course: 'CTI 302',  title: 'Social Thought',         semester: 'Spring 2026', credit_hours: 3 },
    { course: 'ECE 319H', title: 'Embedded Systems Honors',semester: 'Spring 2026', credit_hours: 3 },
  ],
  career_interests: ['hardware', 'embedded systems', 'computer architecture'],
  notes: '',
};

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Full planner flow', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // 1. Loads Adi profile data on startup
  // ────────────────────────────────────────────────────────────────────────────
  it('loads Adi profile data on startup', () => {
    // The initial state should include Adi's semesters and plan
    // 4 AYs × (Fall + Spring + Summer) - 1 trailing Summer = 11 semesters
    expect(INITIAL_STATE.semesters).toHaveLength(11);
    expect(INITIAL_STATE.semesters[0].id).toBe('Fall 2025');
    expect(INITIAL_STATE.semesters[1].id).toBe('Spring 2026');
    expect(INITIAL_STATE.semesters[1].status).toBe('current');

    // Plan should be keyed by semester IDs from SEMESTERS list
    const planKeys = Object.keys(INITIAL_STATE.plan);
    const semesterIds = SEMESTERS.map(s => s.id);
    expect(planKeys).toEqual(expect.arrayContaining(semesterIds));

    // E E → ECE normalization: no "E E" keys should survive normalizeGradeDistributions
    const rawLike = {
      courses: {
        'E E 302': { department: 'E E', department_code: 'E E', course_number: '302', course_title: 'Intro', sections: [], avg_gpa: 3.5, a_pct: 70, b_pct: 20, c_pct: 5, d_pct: 3, f_pct: 2, total_enrollment: 100, total_sections: 3 },
        'ECE 306': { department: 'ECE', department_code: 'ECE', course_number: '306', course_title: 'Computing', sections: [], avg_gpa: 3.2, a_pct: 60, b_pct: 25, c_pct: 10, d_pct: 3, f_pct: 2, total_enrollment: 80, total_sections: 2 },
      }
    };
    const normalized = normalizeGradeDistributions(rawLike);
    expect('E E 302' in normalized).toBe(false);
    expect('ECE 302' in normalized).toBe(true);
    expect(normalized['ECE 302'].department_code).toBe('ECE');
    expect('ECE 306' in normalized).toBe(true);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Displays completed courses in Fall 2025 and Spring 2026
  //    DEMO_PLAN carries Adi's transcript data; INITIAL_PLAN is now empty.
  // ────────────────────────────────────────────────────────────────────────────
  it('displays completed courses in Fall 2025 and Spring 2026 (demo plan)', () => {
    // Fall 2025 — Adi's first semester from the demo transcript
    const fall2025 = DEMO_PLAN['Fall 2025'] ?? [];
    expect(fall2025).toContain('ECE 302');
    expect(fall2025).toContain('ECE 306');
    expect(fall2025).toContain('CTI 301G');
    expect(fall2025).toContain('M 427J');

    // Spring 2026 — current semester (in-progress)
    const spring2026 = DEMO_PLAN['Spring 2026'] ?? [];
    expect(spring2026).toContain('ECE 312H');
    expect(spring2026).toContain('M 325K');

    // Future semesters should be empty in demo plan
    expect(DEMO_PLAN['Fall 2026']).toHaveLength(0);
    expect(DEMO_PLAN['Spring 2027']).toHaveLength(0);

    // INITIAL_PLAN is now empty (tester starts fresh)
    expect(INITIAL_PLAN['Fall 2025']).toHaveLength(0);
    expect(INITIAL_PLAN['Spring 2026']).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Dragging a course from palette to empty semester updates progress bars
  //    (simulated via the planReducer ADD_COURSE action)
  // ────────────────────────────────────────────────────────────────────────────
  it('dragging a course from palette to empty semester updates progress bars', () => {
    // Before: progress with just completed + in-progress courses
    const progressBefore = computeProgress(
      INITIAL_PLAN,
      mockProfile,
      mockCatalog,
      mockPrereqNodes,
      mockDegreeReqs,
      mockTechCore
    );

    // Simulate drag: ADD_COURSE 'ECE 316' to 'Fall 2026' via reducer
    const stateAfterDrop = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: 'Fall 2026',
      courseId: 'ECE 316',
    });

    expect(stateAfterDrop.plan['Fall 2026']).toContain('ECE 316');

    // After: recalculate progress — tech core should be +1
    const progressAfter = computeProgress(
      stateAfterDrop.plan,
      mockProfile,
      mockCatalog,
      mockPrereqNodes,
      mockDegreeReqs,
      mockTechCore
    );

    expect(progressAfter.techCoreCompleted).toBeGreaterThan(progressBefore.techCoreCompleted);
    expect(progressAfter.totalHours).toBeGreaterThan(progressBefore.totalHours);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Adding a course with unmet prereqs shows red border
  //    (prerequisite validation detects the violation)
  // ────────────────────────────────────────────────────────────────────────────
  it('adding a course with unmet prereqs shows red border', () => {
    // Build a small graph: ECE 460N requires ECE 316
    const graphData: PrereqGraphData = {
      nodes: {
        'ECE 316':  { title: 'Digital Logic', credits: 3, category: 'ece_upper', offered: ['fall'],   flags: [] },
        'ECE 460N': { title: 'Comp Arch',     credits: 4, category: 'ece_upper', offered: ['fall'],   flags: [] },
      },
      edges: [
        { from: 'ECE 316', to: 'ECE 460N', type: 'prerequisite' },
      ],
    };
    // Pass empty CNF so this test exercises the graph's own edge (ECE 316 → ECE 460N),
    // not the production authored CNF which uses a different OR-group for ECE 460N.
    const graph = new PrereqGraph(graphData, {});

    // Plan: ECE 460N placed in Fall 2026 WITHOUT ECE 316 anywhere
    const plan = {
      'Fall 2026': ['ECE 460N'],
    };
    const semesterOrder = ['Fall 2026'];

    const violations = graph.validatePlan(plan, semesterOrder);

    expect(violations).toHaveLength(1);
    expect(violations[0].courseId).toBe('ECE 460N');
    expect(violations[0].missingPrereqs).toContain('ECE 316');
    expect(violations[0].violationType).toBe('prereq');

    // Now fix the plan — place ECE 316 first
    const fixedPlan = {
      'Fall 2026': ['ECE 316'],
      'Fall 2027': ['ECE 460N'],
    };
    const fixedOrder = ['Fall 2026', 'Fall 2027'];
    const fixedViolations = graph.validatePlan(fixedPlan, fixedOrder);

    expect(fixedViolations).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. What-if: switching tech core updates palette contents (diff)
  // ────────────────────────────────────────────────────────────────────────────
  it('what-if: switching tech core updates palette contents', () => {
    const techCores: Record<string, TechCoreTrack> = {
      'computer_architecture': {
        name: 'Computer Architecture & Embedded Systems',
        graduate_track: '', category: 'CE', required_math: 'M 325K',
        required_courses: {
          core: [{ id: 'ECE 316', title: 'Digital Logic' }, { id: 'ECE 460N', title: 'Comp Arch' }],
        },
        elective_count: { general: 3, ecb: 2 },
        elective_pool: ['ECE 422C'],
      },
      'microelectronics': {
        name: 'Microelectronics',
        graduate_track: '', category: 'EE', required_math: 'M 325K',
        required_courses: {
          core: [{ id: 'ECE 438', title: 'VLSI' }, { id: 'ECE 321', title: 'Analog' }],
        },
        elective_count: { general: 3, ecb: 2 },
        elective_pool: ['ECE 362K'],
      },
    };

    const mockMathReqs: MathRequirements = {
      math_ba: {
        program_name: '', catalog_url: '', total_upper_division_hours: 24, requirements: [],
        overlap_with_ece: [],
        additional_courses_needed: { note: '', minimum_additional_hours: 15, breakdown: [] },
      },
    };

    const diff = computeWhatIfDiff(
      { techCoreId: 'computer_architecture', mathBAToggle: false },
      { techCoreId: 'microelectronics', mathBAToggle: false },
      techCores,
      mockMathReqs,
      mockCatalog,
      [] // no completed courses
    );

    // Switching from CA&ES to Microelectronics:
    // - Adds Microelectronics-specific courses
    // - Removes CA&ES-specific courses
    expect(diff.coursesAdded).toContain('ECE 438');
    expect(diff.coursesAdded).toContain('ECE 321');
    expect(diff.coursesRemoved).toContain('ECE 316');
    expect(diff.coursesRemoved).toContain('ECE 460N');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Export plan → clear → import plan → plan is restored
  //    (reducer: RESET_PLAN then SET_FULL_STATE)
  // ────────────────────────────────────────────────────────────────────────────
  it('export plan → clear → import plan → plan is restored', () => {
    // Step A: Start from initial state (this is "export")
    const exportedState: PlanState = { ...INITIAL_STATE };

    // Step B: Add a course to make the state non-trivial
    const stateWithCourse = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: 'Fall 2026',
      courseId: 'ECE 316',
    });
    expect(stateWithCourse.plan['Fall 2026']).toContain('ECE 316');

    // Step C: Reset (simulates "Clear Plan") — dispatched through historyReducer
    // because historyReducer intercepts RESET_PLAN before planReducer sees it.
    const clearedHistory = historyReducer(
      { past: [], present: stateWithCourse, future: [] },
      { type: 'RESET_PLAN' }
    );
    const clearedState = clearedHistory.present;
    expect(clearedState.plan['Fall 2026']).toHaveLength(0);

    // Step D: Import original exported state (simulates "Import JSON")
    const restoredState = planReducer(clearedState, {
      type: 'SET_FULL_STATE',
      state: exportedState,
    });

    // Verify exact round-trip restoration
    expect(restoredState.plan).toEqual(exportedState.plan);
    expect(restoredState.semesters).toEqual(exportedState.semesters);
    expect(restoredState.whatIf).toEqual(exportedState.whatIf);

    // Sanity: Fall 2025 matches the exported state (INITIAL_PLAN is now empty)
    expect(restoredState.plan['Fall 2025']).toEqual(exportedState.plan['Fall 2025']);
    expect(restoredState.plan['Fall 2025']).toHaveLength(0);
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. V2: selecting courses and optimizing returns conflict-free schedules
  // ────────────────────────────────────────────────────────────────────────────
  it('V2: selecting courses and optimizing returns conflict-free schedules', () => {
    // Two courses with non-overlapping sections
    const courses: CourseSections[] = [
      {
        course: 'ECE 316',
        title: 'Digital Logic Design',
        sections: [
          {
            unique: 16001,
            meetings: [{ days: 'MWF', time: '9:00 a.m.-10:00 a.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof. Smith',
            status: 'open',
            core: '',
          },
          {
            unique: 16002,
            meetings: [{ days: 'TTH', time: '2:00 p.m.-3:30 p.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof. Jones',
            status: 'open',
            core: '',
          },
        ],
      },
      {
        course: 'ECE 460N',
        title: 'Computer Architecture',
        sections: [
          {
            unique: 46001,
            meetings: [{ days: 'MWF', time: '11:00 a.m.-12:00 p.m.', room: 'GDC 2.216' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof. Brown',
            status: 'open',
            core: '',
          },
          {
            unique: 46002,
            meetings: [{ days: 'TTH', time: '9:30 a.m.-11:00 a.m.', room: 'GDC 2.216' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof. Davis',
            status: 'open',
            core: '',
          },
        ],
      },
    ];

    // No grade data → scheduler falls back to 3.0 GPA for all
    const gradeDistributions = {};

    const { candidates, truncated } = generateSchedules(courses, gradeDistributions);

    // Small selection → should not be truncated
    expect(truncated).toBe(false);

    // Should return multiple conflict-free combinations (up to 5)
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    // Every candidate must have exactly 2 sections (one per course)
    for (const candidate of candidates) {
      expect(candidate.sections).toHaveLength(2);
    }

    // Verify no candidate has a time conflict
    for (const candidate of candidates) {
      const [sec1, sec2] = candidate.sections;
      // Same-day overlap check: MWF vs MWF at non-overlapping times → ok
      // TTH vs TTH at non-overlapping times → ok
      // But our test data has no real conflicts between courses, so all 4 combos should be valid
      const days1 = sec1.meetings[0].days ?? '';
      const days2 = sec2.meetings[0].days ?? '';
      const sharedDays = days1.split('').some(d => days2.includes(d));

      if (sharedDays) {
        // If same days, times must NOT overlap
        // All our test sections are at non-overlapping times even on same days
        // (MWF 9-10am vs MWF 11am-12pm → no overlap)
        const time1 = sec1.meetings[0].time;
        const time2 = sec2.meetings[0].time;
        expect(time1).not.toBe(time2);
      }
    }

    // Scores should be sorted descending
    for (let i = 0; i < candidates.length - 1; i++) {
      expect(candidates[i].score).toBeGreaterThanOrEqual(candidates[i + 1].score);
    }
  });
});

// ─── Edge case tests ──────────────────────────────────────────────────────────

describe('Edge cases', () => {
  // ─── Duplicate prevention ──────────────────────────────────────────────────
  it('cannot place the same course in two semesters', () => {
    let state = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: 'Fall 2026',
      courseId: 'ECE 316',
    });
    // Try to add the same course to a different semester
    state = planReducer(state, {
      type: 'ADD_COURSE',
      semesterId: 'Spring 2027',
      courseId: 'ECE 316',
    });

    expect(state.plan['Fall 2026']).toContain('ECE 316');
    expect(state.plan['Spring 2027'] ?? []).not.toContain('ECE 316');
  });

  // ─── Completed courses excluded from palette ───────────────────────────────
  it('course already placed in one semester cannot be added to another (duplicate guard)', () => {
    // Place ECE 302 in Fall 2026 (a future semester — past semesters now reject writes).
    const stateWithCourse = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: 'Fall 2026',
      courseId: 'ECE 302',
    });
    expect(stateWithCourse.plan['Fall 2026']).toContain('ECE 302');

    // Now attempt to add the same course to Spring 2027 — should be a no-op
    const state = planReducer(stateWithCourse, {
      type: 'ADD_COURSE',
      semesterId: 'Spring 2027',
      courseId: 'ECE 302', // already in Fall 2026
    });

    // ECE 302 should remain only in Fall 2026, not added to Spring 2027
    expect(state.plan['Fall 2026']).toContain('ECE 302');
    expect(state.plan['Spring 2027'] ?? []).not.toContain('ECE 302');
  });

  // ─── Empty plan — no crash ─────────────────────────────────────────────────
  it('empty plan state: RESET_PLAN + empty semesters do not crash validation', () => {
    const graphData: PrereqGraphData = {
      nodes: { 'ECE 302': { title: 'Intro', credits: 3, category: 'ece_lower', offered: ['fall'], flags: [] } },
      edges: [],
    };
    const graph = new PrereqGraph(graphData, {});
    const emptyPlan = { 'Fall 2026': [] };
    const violations = graph.validatePlan(emptyPlan, ['Fall 2026']);
    expect(violations).toHaveLength(0);
  });

  // ─── Moving a course away invalidates its dependents ──────────────────────
  it('moving a prereq course to a later semester invalidates dependents', () => {
    const graphData: PrereqGraphData = {
      nodes: {
        'ECE 302':  { title: 'Intro',     credits: 3, category: 'ece_lower', offered: ['fall'], flags: [] },
        'ECE 312H': { title: 'Software',  credits: 3, category: 'ece_core',  offered: ['spring'], flags: [] },
      },
      edges: [{ from: 'ECE 302', to: 'ECE 312H', type: 'prerequisite' }],
    };
    // Pass empty CNF: test validates the edge ECE 302 → ECE 312H directly,
    // not the production CNF group which requires the intro-computing family.
    const graph = new PrereqGraph(graphData, {});

    // Valid: ECE 302 in Sem 1, ECE 312H in Sem 2
    const validPlan = { 'Sem 1': ['ECE 302'], 'Sem 2': ['ECE 312H'] };
    expect(graph.validatePlan(validPlan, ['Sem 1', 'Sem 2'])).toHaveLength(0);

    // Invalid: ECE 302 moved to Sem 3 (after ECE 312H)
    const invalidPlan = { 'Sem 1': [], 'Sem 2': ['ECE 312H'], 'Sem 3': ['ECE 302'] };
    const violations = graph.validatePlan(invalidPlan, ['Sem 1', 'Sem 2', 'Sem 3']);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].courseId).toBe('ECE 312H');
  });

  // ─── Progress bars: CR grade counts toward hours ───────────────────────────
  it('CR (credit-by-exam) courses count toward total credit hours', () => {
    // mockProfile includes RHE 306 with grade 'CR' and UGS 016 with grade 'CR'
    // RHE 306 = 3 credit hours, UGS 016 = 0 credit hours
    const progress = computeProgress(
      {},                // empty plan (only completed/in-progress count)
      mockProfile,
      mockCatalog,
      mockPrereqNodes,
      mockDegreeReqs,
      mockTechCore
    );

    // Completed: ECE 302(3) + ECE 306(3) + CTI 301G(3) + M 427J(4) + UGS 016(0) + RHE 306(3) = 16
    // In-progress: ECE 312H(3) + M 325K(3) + CTI 302(3) + ECE 319H(3) = 12
    // Total: 28
    expect(progress.totalHours).toBe(28);
  });

  // ─── Tech core progress does not exceed 8 ─────────────────────────────────
  it('tech core progress is capped at 8 even with many electives', () => {
    // Add many electives to the plan
    const heavyPlan: Record<string, string[]> = {
      'Fall 2026': ['ECE 316', 'ECE 460N', 'ECE 445L', 'ECE 360C', 'ECE 422C'],
    };
    const progress = computeProgress(
      heavyPlan,
      mockProfile,
      mockCatalog,
      mockPrereqNodes,
      mockDegreeReqs,
      mockTechCore
    );

    // Tech core max is 8 (set in computeProgress)
    expect(progress.techCoreCompleted).toBeLessThanOrEqual(8);
    expect(progress.techCoreTotal).toBe(8);
  });

  // ─── Cancelled sections excluded from scheduling ──────────────────────────
  it('cancelled sections are excluded from schedule generation', () => {
    const courses: CourseSections[] = [
      {
        course: 'ECE 316',
        title: 'Digital Logic',
        sections: [
          {
            unique: 16001,
            meetings: [{ days: 'MWF', time: '9:00 a.m.-10:00 a.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof. Smith',
            status: 'cancelled',  // ← cancelled
            core: '',
          },
          {
            unique: 16002,
            meetings: [{ days: 'TTH', time: '11:00 a.m.-12:30 p.m.', room: 'ENS 145' }],
            instruction_mode: 'Face-to-face',
            instructor: 'Prof. Jones',
            status: 'open',
            core: '',
          },
        ],
      },
    ];

    const { candidates, truncated } = generateSchedules(courses, {});
    // Only one open section → exactly one candidate, not truncated
    expect(truncated).toBe(false);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].sections[0].unique).toBe(16002);
  });
});
