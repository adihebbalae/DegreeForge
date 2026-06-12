import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeProgress } from './progress';
import type {
  Plan,
  UserProfile,
  CourseCatalog,
  DegreeRequirements,
  TechCoreTrack,
  TechCores,
  PrereqGraphData
} from '../types';

describe('computeProgress', () => {
  const mockCatalog: CourseCatalog = {
    'ECE 302': { id: 'ECE 302', title: 'Intro to EE', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 306': { id: 'ECE 306', title: 'Intro to Computing', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 312H': { id: 'ECE 312H', title: 'Software I Honors', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 319H': { id: 'ECE 319H', title: 'Embedded Systems Honors', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 316': { id: 'ECE 316', title: 'Digital Logic Design', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 460N': { id: 'ECE 460N', title: 'Computer Architecture', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 445L': { id: 'ECE 445L', title: 'Embedded Systems Lab', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 360C': { id: 'ECE 360C', title: 'Algorithms', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 411': { id: 'ECE 411', title: 'Circuit Theory', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 313': { id: 'ECE 313', title: 'Signals', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 408C': { id: 'M 408C', title: 'Calculus I', credits: 4, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 427J': { id: 'M 427J', title: 'Diff Eq', credits: 4, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 325K': { id: 'M 325K', title: 'Discrete Math', credits: 3, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'RHE 306': { id: 'RHE 306', title: 'Rhetoric', credits: 3, department: 'RHE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'CTI 301G': { id: 'CTI 301G', title: 'Ancient Greece', credits: 3, department: 'CTI', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'CTI 302': { id: 'CTI 302', title: 'Social Thought', credits: 3, department: 'CTI', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'UGS 303': { id: 'UGS 303', title: 'Signature Course', credits: 3, department: 'UGS', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 422C': { id: 'ECE 422C', title: 'Software II', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  };

  const mockPrereqNodes: PrereqGraphData['nodes'] = {};

  const mockDegreeReqs: DegreeRequirements = {
    ece_core: {
      courses: ['ECE 402', 'ECE 406', 'ECE 419K', 'ECE 411', 'ECE 412', 'ECE 313'],
      notes: '',
      honors_variants: {
        'ECE 402': 'ECE 302H',
        'ECE 412': 'ECE 312H',
        'ECE 419K': 'ECE 319H'
      },
      senior_design_options: []
    },
    core_curriculum: {
      slots: [
        { id: 'ugs', label: 'UGS', hours: 3, core_code: '090', options: ['UGS 303'], ap_eligible: false },
        { id: 'rhe', label: 'RHE', hours: 3, core_code: '010', options: ['RHE 306'], ap_eligible: true },
        { id: 'vapa', label: 'VAPA', hours: 3, core_code: '050', options: ['list_of_approved'], ap_eligible: true },
        { id: 'humanities', label: 'Humanities', hours: 3, core_code: '040', options: ['list_of_approved'], ap_eligible: true },
      ]
    },
    tech_core: {
      description: '',
      components: {
        advanced_math: { hours: '3', count: 1 },
        core_courses: { hours: '6', count: 2 },
        core_lab: { hours: '4', count: 1 },
        tech_electives: { hours_min: 12, count: '3' }
      },
      notes: ''
    },
    advanced_tech_elective: { count: 1, hours: '3', description: '' },
    free_electives: { total_hours: 14, constraints: [], approved_list_url: '' },
    math_sequence: { required: [], alternate_calculus: [], notes: '' },
    physics_sequence: { required: [], alternate: [], notes: '' },
    total_credit_hours: 128,
    notes: ''
  };

  const mockTechCore: TechCoreTrack = {
    name: 'Computer Architecture',
    graduate_track: '',
    category: 'CE',
    required_math: 'M 325K',
    required_courses: {
      advanced_math: { id: 'M 325K', title: 'Discrete Math' },
      core: [{ id: 'ECE 316', title: 'Digital Logic' }, { id: 'ECE 460N', title: 'Comp Arch' }],
      core_lab: { id: 'ECE 445L', title: 'Embedded Lab' },
      required_elective: { id: 'ECE 360C', title: 'Algorithms' }
    },
    elective_count: { general: 3, ecb: 2 },
    elective_pool: ['ECE 422C']
  };

  const mockProfile: UserProfile = {
    name: 'Adi',
    eid: '', university: '', catalog_year: '', major: '', classification: '', first_semester: '', graduation_target: '',
    tech_core: { declared: 'Computer Architecture', status: '', required_math: '', required_ece: [], tech_electives_needed: 3 },
    secondary_aspirations: { math_ba: { status: '', notes: '' }, advanced_math_cert: { status: '', notes: '' }, jefferson_scholars_cert: { status: '', notes: '' } },
    preferences: { course_load: '', course_load_tolerance: '', time_preference: '', summer_courses: false, summer_notes: '' },
    gpa: { cumulative: 4, lower_division: 4, upper_division: 4, gpa_hours: 0, grade_points: 0 },
    credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
    completed_courses: [
      { course: 'ECE 302', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
      { course: 'RHE 306', title: '', grade: 'CR', semester: '', type: '', credit_hours: 3 },
    ],
    in_progress_courses: [
      { course: 'ECE 312H', title: '', semester: '', credit_hours: 3 },
    ],
    career_interests: [],
    notes: ''
  };

  it('counts Adi profile completed courses correctly', () => {
    const plan: Plan = {};
    const result = computeProgress(plan, mockProfile, mockCatalog, mockDegreeReqs, mockTechCore);
    
    // ECE 302 is honors variant for ECE 402, ECE 312H is variant for ECE 412
    expect(result.eceCoreCompleted).toBe(2);
    // RHE 306 counts for Gen Ed
    expect(result.genEdCompleted).toBe(1);
    // ECE 302 (3) + RHE 306 (3) + ECE 312H (3) = 9
    expect(result.totalHours).toBe(9);
  });

  it('adds placed courses to totals', () => {
    const plan: Plan = {
      'Fall 2026': ['ECE 316', 'M 325K']
    };
    const result = computeProgress(plan, mockProfile, mockCatalog, mockDegreeReqs, mockTechCore);
    
    // ECE 316 and M 325K are tech core
    expect(result.techCoreCompleted).toBe(2);
    // ECE 302 (3) + RHE 306 (3) + ECE 312H (3) + ECE 316 (3) + M 325K (3) = 15
    expect(result.totalHours).toBe(15);
  });

  it('does not double-count completed + placed courses', () => {
    const plan: Plan = {
      'Fall 2026': ['ECE 302'] // Already in completed_courses
    };
    const result = computeProgress(plan, mockProfile, mockCatalog, mockDegreeReqs, mockTechCore);
    
    expect(result.totalHours).toBe(9);
  });

  it('tech core counts only from selected track', () => {
    const plan: Plan = {
      'Fall 2026': ['ECE 316', 'ECE 422C'] // ECE 316 is required, ECE 422C is in pool
    };
    const result = computeProgress(plan, mockProfile, mockCatalog, mockDegreeReqs, mockTechCore);
    
    expect(result.techCoreCompleted).toBe(2);
  });

  it('counts CTI courses toward Gen Ed', () => {
    const profileWithCTI: UserProfile = {
      ...mockProfile,
      completed_courses: [
        ...mockProfile.completed_courses,
        { course: 'CTI 301G', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        { course: 'CTI 302', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
      ]
    };
    const plan: Plan = {};
    const result = computeProgress(plan, profileWithCTI, mockCatalog, mockDegreeReqs, mockTechCore);
    
    // RHE 306 (1) + CTI 301G (1) + CTI 302 (1) = 3
    expect(result.genEdCompleted).toBe(3);
  });

  it('counts advanced ECE electives for free electives bar', () => {
    const plan: Plan = {
      'Fall 2026': ['ECE 360C', 'ECE 411'] // ECE 360C is Tech Core, ECE 411 is ECE Core. 
    };
    // Let's add an elective
    const planWithElective: Plan = {
      ...plan,
      'Spring 2027': ['ECE 325'] // ECE 325 is advanced ECE (>= 320) and not in ECE Core or Tech Core in this mock
    };
    
    // Need to add ECE 325 to catalog
    const catalogWithElective = {
      ...mockCatalog,
      'ECE 325': { id: 'ECE 325', title: 'EM Fields', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' }
    };

    const result = computeProgress(planWithElective, mockProfile, catalogWithElective, mockDegreeReqs, mockTechCore);

    expect(result.electiveHours).toBe(3);
  });
});

// ─── Theme H (item 2): real-data characterization ─────────────────────────────
//
// The mock-based tests above run computeProgress against an inline DegreeRequirements
// that production never uses. This block loads the REAL degree-requirements.json +
// course-catalog.json + the canonical Adi user-profile.json and asserts concrete
// counts, so a renamed slot id, a changed honors_variant, or a regressed counting
// loop surfaces as a failing test rather than shipping silently.
describe('computeProgress — real data (characterization)', () => {
  function loadJson<T>(filename: string): T {
    const path = join(__dirname, '../../public/data', filename);
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  }

  const catalog = loadJson<CourseCatalog>('course-catalog.json');
  const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
  const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
  const techCores = loadJson<TechCores>('tech-cores.json');
  const adiProfile = loadJson<UserProfile>('user-profile.json');
  const techCore = techCores.software_engineering;

  it('reports the canonical requirement totals from the real degree JSON', () => {
    const result = computeProgress({}, adiProfile, catalog, degreeReqs, techCore);

    // Derivable / constant denominators — these pin the X/Y targets the bars render.
    expect(result.totalHoursTarget).toBe(128);
    expect(result.eceCoreTotal).toBe(degreeReqs.ece_core.courses.length); // 10
    expect(result.genEdTotal).toBe(8);
    expect(result.techCoreTotal).toBe(8);
    expect(result.electiveTotalHours).toBe(11);
  });

  it("counts Adi's real transcript (completed + in-progress) against real requirements", () => {
    const result = computeProgress({}, adiProfile, catalog, degreeReqs, techCore);

    // Concrete counts for the shipped Adi profile against the real requirements.
    // Golden values — a refactor that changes how courses are counted breaks this.
    // Adi's transcript: completed M 508M(5) M 411(4) RHE 306(3) M 408C(4) UGS 016(0)
    // ECE 302(3) ECE 306(3) CTI 301G(3) M 427J(4) + in-progress ECE 312H(3) M 325K(3)
    // CTI 302(3) ECE 319H(3) = 41 transcript credit hours.
    expect(result.totalHours).toBe(41);
    // ECE 302, ECE 306, ECE 312H (honors→core), ECE 319H (honors→core) → 4 of 10.
    expect(result.eceCoreCompleted).toBe(4);
    // RHE 306 (rhe), CTI 301G (vapa equiv), CTI 302 (humanities equiv) → 3 of 8.
    expect(result.genEdCompleted).toBe(3);
    // M 325K satisfies the software_engineering advanced-math slot → 1 of 8.
    expect(result.techCoreCompleted).toBe(1);
  });
});
