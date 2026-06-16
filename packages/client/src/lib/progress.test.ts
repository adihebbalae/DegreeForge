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
    free_electives: { total_hours: 11, constraints: [], approved_list_url: '' },
    math_sequence: { required: [], alternate_calculus: [], notes: '' },
    physics_sequence: { required: [], alternate: [], notes: '' },
    total_credit_hours: 125,
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
    expect(result.totalHoursTarget).toBe(125);
    expect(result.eceCoreTotal).toBe(degreeReqs.ece_core.courses.length); // 10
    expect(result.genEdTotal).toBe(9); // 9 slots authored in degree-requirements.json
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

  it('bucket totalHours sum equals total_credit_hours for SE track', () => {
    // The 6 bucket totalHours must sum exactly to degreeReqs.total_credit_hours so
    // radial arcs cover the full circle. freeElecTotal is the computed remainder.
    const result = computeProgress({}, adiProfile, catalog, degreeReqs, techCore);
    const bucketSum = result.buckets.reduce((s, b) => s + b.totalHours, 0);
    expect(bucketSum).toBe(degreeReqs.total_credit_hours);
  });

  it('bucket totalHours sum equals total_credit_hours for CA track', () => {
    const caTechCore = techCores.computer_architecture;
    const result = computeProgress({}, adiProfile, catalog, degreeReqs, caTechCore);
    const bucketSum = result.buckets.reduce((s, b) => s + b.totalHours, 0);
    expect(bucketSum).toBe(degreeReqs.total_credit_hours);
  });
});

// ─── Core-flag gen-ed satisfaction (TASK-catalog) ─────────────────────────────
//
// vapa / sbs / his / gov / ugs slots are satisfied by ANY planned/completed
// course whose catalog `core` flag matches the bucket — not just the explicit
// `options` list. These tests use the REAL degree-requirements.json (which has
// the his1/his2 + gov1/gov2 two-slot requirements) so the no-double-count
// guarantee is exercised against production slot ids.
describe('computeProgress — core-flag gen-ed satisfaction', () => {
  function loadJson<T>(filename: string): T {
    const path = join(__dirname, '../../public/data', filename);
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  }

  const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
  const techCores = loadJson<TechCores>('tech-cores.json');
  const techCore = techCores.software_engineering;

  // A catalog of core-flagged courses NOT in any slot's explicit `options` list,
  // so satisfaction can only come from the core flag.
  const coreCatalog: CourseCatalog = {
    'AET 304': { id: 'AET 304', title: 'Some VAPA course', credits: 3, department: 'AET', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['vapa'] },
    'ANT 302': { id: 'ANT 302', title: 'Some SBS course', credits: 3, department: 'ANT', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['sbs'] },
    'HIS 360': { id: 'HIS 360', title: 'Some HIS course', credits: 3, department: 'HIS', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['his'] },
    'HIS 361': { id: 'HIS 361', title: 'Another HIS course', credits: 3, department: 'HIS', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['his'] },
    'GOV 360': { id: 'GOV 360', title: 'Some GOV course', credits: 3, department: 'GOV', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['gov'] },
    'UGS 320': { id: 'UGS 320', title: 'Some signature course', credits: 3, department: 'UGS', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['ugs'] },
  };

  const emptyProfile: UserProfile = {
    name: '', eid: '', university: '', catalog_year: '', major: '', classification: '', first_semester: '', graduation_target: '',
    tech_core: { declared: '', status: '', required_math: '', required_ece: [], tech_electives_needed: 0 },
    secondary_aspirations: { math_ba: { status: '', notes: '' }, advanced_math_cert: { status: '', notes: '' }, jefferson_scholars_cert: { status: '', notes: '' } },
    preferences: { course_load: '', course_load_tolerance: '', time_preference: '', summer_courses: false, summer_notes: '' },
    gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
    credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
    completed_courses: [],
    in_progress_courses: [],
    career_interests: [],
    notes: '',
  };

  it('a core=vapa course satisfies the VAPA slot', () => {
    const result = computeProgress({ 'Fall 2026': ['AET 304'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    const vapaSub = result.buckets.find((b) => b.id === 'gen_ed')!.subRequirements!.find((s) => s.label === 'Visual & Performing Arts');
    expect(vapaSub?.status).toBe('done');
    expect(result.completedGenEdSlots.has('vapa')).toBe(true);
  });

  it('a core=sbs course satisfies the Social & Behavioral Sciences slot', () => {
    const result = computeProgress({ 'Fall 2026': ['ANT 302'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    expect(result.completedGenEdSlots.has('sbs')).toBe(true);
  });

  it('a core=his course satisfies a US History slot', () => {
    const result = computeProgress({ 'Fall 2026': ['HIS 360'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    // One his-flagged course satisfies exactly ONE of the two his slots.
    const hisDone = (['his1', 'his2'] as const).filter((id) => result.completedGenEdSlots.has(id));
    expect(hisDone).toHaveLength(1);
  });

  it('a core=gov course satisfies a Government slot', () => {
    const result = computeProgress({ 'Fall 2026': ['GOV 360'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    const govDone = (['gov1', 'gov2'] as const).filter((id) => result.completedGenEdSlots.has(id));
    expect(govDone).toHaveLength(1);
  });

  it('a core=ugs course satisfies the First-Year Signature slot', () => {
    const result = computeProgress({ 'Fall 2026': ['UGS 320'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    expect(result.completedGenEdSlots.has('ugs')).toBe(true);
  });

  it('ONE his-flagged course does not double-count across his1 + his2', () => {
    const one = computeProgress({ 'Fall 2026': ['HIS 360'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    expect((['his1', 'his2'] as const).filter((id) => one.completedGenEdSlots.has(id))).toHaveLength(1);

    // TWO distinct his-flagged courses fill BOTH his slots.
    const two = computeProgress({ 'Fall 2026': ['HIS 360', 'HIS 361'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    expect((['his1', 'his2'] as const).filter((id) => two.completedGenEdSlots.has(id))).toHaveLength(2);
  });

  // ─── BLOCKER regression: explicit-option path must not double-count ──────────
  //
  // his2 resolves to his1's option list (same_as_his1). A single HIS 315K (a
  // member of both his1's and his2's explicit options) must satisfy exactly ONE
  // his slot — Pass 1 has to be consume-aware, not just test the full taken set.
  it('ONE explicit-option HIS 315K satisfies his1 only, not his2', () => {
    const r = computeProgress({ 'Fall 2026': ['HIS 315K'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    expect(r.completedGenEdSlots.has('his1')).toBe(true);
    expect(r.completedGenEdSlots.has('his2')).toBe(false);
    expect((['his1', 'his2'] as const).filter((id) => r.completedGenEdSlots.has(id))).toHaveLength(1);
  });

  it('ONE explicit-option GOV 310L satisfies gov1 only, not gov2', () => {
    // gov1 lists GOV 310L; gov2 has a different option list. GOV 310L also
    // carries a core:[gov] flag, so the Pass-2 fallback must not reuse the
    // already-consumed GOV 310L to fill gov2.
    const r = computeProgress({ 'Fall 2026': ['GOV 310L'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    expect(r.completedGenEdSlots.has('gov1')).toBe(true);
    expect(r.completedGenEdSlots.has('gov2')).toBe(false);
  });

  it('HIS 315K + HIS 315L fill BOTH his slots via explicit options', () => {
    const r = computeProgress({ 'Fall 2026': ['HIS 315K', 'HIS 315L'] }, emptyProfile, coreCatalog, degreeReqs, techCore);
    expect(r.completedGenEdSlots.has('his1')).toBe(true);
    expect(r.completedGenEdSlots.has('his2')).toBe(true);
  });

  // ─── SHOULD-FIX regression: order-independent core-flag allocation ───────────
  //
  // A multi-flag [vapa,sbs] course must not strand the sbs slot that a
  // single-flag [vapa] course could have left for it. Allocation processes
  // single-purpose courses first, so BOTH slots satisfy regardless of plan order.
  it('multi-flag + single-flag course satisfy both slots, independent of plan order', () => {
    const abCatalog: CourseCatalog = {
      ...coreCatalog,
      // A: eligible for two open slots (vapa + sbs)
      'AAA 301': { id: 'AAA 301', title: 'A', credits: 3, department: 'AAA', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['vapa', 'sbs'] },
      // B: eligible for one open slot (vapa)
      'BBB 301': { id: 'BBB 301', title: 'B', credits: 3, department: 'BBB', description: '', prerequisites: [], corequisites: [], grading: 'letter', core: ['vapa'] },
    };
    for (const order of [['AAA 301', 'BBB 301'], ['BBB 301', 'AAA 301']]) {
      const r = computeProgress({ 'Fall 2026': order }, emptyProfile, abCatalog, degreeReqs, techCore);
      expect(r.completedGenEdSlots.has('vapa')).toBe(true);
      expect(r.completedGenEdSlots.has('sbs')).toBe(true);
    }
  });

  it('the 6 bucket totalHours still sum to total_credit_hours with core-flagged courses planned', () => {
    const result = computeProgress(
      { 'Fall 2026': ['AET 304', 'ANT 302', 'HIS 360', 'GOV 360', 'UGS 320'] },
      emptyProfile,
      coreCatalog,
      degreeReqs,
      techCore
    );
    const bucketSum = result.buckets.reduce((s, b) => s + b.totalHours, 0);
    expect(bucketSum).toBe(degreeReqs.total_credit_hours);
  });

  it('bucket totalHours sum holds with explicit-option HIS/GOV core courses planned', () => {
    // Exercises the invariant against the exact courses the Pass-1 fix touches:
    // explicit-option his1/his2 + gov1 courses, all carrying core flags. The
    // genEdTotalHours (Σ slot.hours) is fixed regardless of how slots fill, so the
    // 6-bucket sum must still equal total_credit_hours.
    const result = computeProgress(
      { 'Fall 2026': ['HIS 315K', 'HIS 315L', 'GOV 310L'] },
      emptyProfile,
      coreCatalog,
      degreeReqs,
      techCore
    );
    const bucketSum = result.buckets.reduce((s, b) => s + b.totalHours, 0);
    expect(bucketSum).toBe(degreeReqs.total_credit_hours);
  });
});

// ─── BucketView tests (TASK-098 Increment 1) ─────────────────────────────────
//
// Four mandatory cases per spec §6:
//   1. Partially-done pick-one slot → remaining[] shows the correct "still need"
//   2. Fully-satisfied bucket → remaining[] empty, complete: true
//   3. Over-cap bucket (>100%) → fill clamps, remaining[] empty
//   4. Adi real-data characterization: incomplete bucket remaining[] correct,
//      completed bucket (math) has empty remaining[]
//
describe('buildBucketViews — BucketView per-bucket view-model', () => {
  function loadJson<T>(filename: string): T {
    const path = join(__dirname, '../../public/data', filename);
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  }

  // ── Shared mock data ────────────────────────────────────────────────────────
  const mockCatalog: CourseCatalog = {
    'ECE 402': { id: 'ECE 402', title: 'Intro to EE', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 406': { id: 'ECE 406', title: 'Intro to Computing', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 419K': { id: 'ECE 419K', title: 'Embedded Systems', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 411': { id: 'ECE 411', title: 'Circuit Theory', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 412': { id: 'ECE 412', title: 'Software I', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 313': { id: 'ECE 313', title: 'Linear Systems', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 333T': { id: 'ECE 333T', title: 'Eng Communication', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 351K': { id: 'ECE 351K', title: 'Probability', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 364D': { id: 'ECE 364D', title: 'Engineering Design', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 464K': { id: 'ECE 464K', title: 'Senior Design', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 408C': { id: 'M 408C', title: 'Calculus I', credits: 4, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 408D': { id: 'M 408D', title: 'Calculus II', credits: 4, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 427J': { id: 'M 427J', title: 'Diff Eq', credits: 4, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 340L': { id: 'M 340L', title: 'Matrices', credits: 3, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 325K': { id: 'M 325K', title: 'Discrete Math', credits: 3, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 316': { id: 'ECE 316', title: 'Digital Logic', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 460N': { id: 'ECE 460N', title: 'Computer Arch', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 445L': { id: 'ECE 445L', title: 'Embedded Lab', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 360C': { id: 'ECE 360C', title: 'Algorithms', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'RHE 306': { id: 'RHE 306', title: 'Rhetoric', credits: 3, department: 'RHE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'UGS 303': { id: 'UGS 303', title: 'Signature', credits: 3, department: 'UGS', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'ECE 422C': { id: 'ECE 422C', title: 'Software II', credits: 4, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  };

  const mockDegreeReqs: DegreeRequirements = {
    ece_core: {
      courses: ['ECE 402', 'ECE 406', 'ECE 419K', 'ECE 411', 'ECE 412', 'ECE 313', 'ECE 333T', 'ECE 351K', 'ECE 364D', 'ECE 464K'],
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
      ]
    },
    tech_core: { description: 'Tech core', components: { advanced_math: { hours: '3', count: 1 }, core_courses: { hours: '6', count: 2 }, core_lab: { hours: '4', count: 1 }, tech_electives: { hours_min: 12, count: '3' } }, notes: '' },
    advanced_tech_elective: { count: 1, hours: '3', description: '' },
    free_electives: { total_hours: 11, constraints: ['At least 3 hrs advanced math or science'], approved_list_url: '' },
    math_sequence: { required: ['M 408C', 'M 408D', 'M 427J', 'M 340L'], alternate_calculus: [], notes: '' },
    physics_sequence: { required: ['PHY 303K', 'PHY 105M', 'PHY 303L', 'PHY 105N'], alternate: [], notes: '' },
    total_credit_hours: 125,
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

  const emptyProfile: UserProfile = {
    name: 'Test', eid: '', university: '', catalog_year: '', major: '', classification: '',
    first_semester: '', graduation_target: '',
    tech_core: { declared: '', status: '', required_math: '', required_ece: [], tech_electives_needed: 3 },
    secondary_aspirations: { math_ba: { status: '', notes: '' }, advanced_math_cert: { status: '', notes: '' }, jefferson_scholars_cert: { status: '', notes: '' } },
    preferences: { course_load: '', course_load_tolerance: '', time_preference: '', summer_courses: false, summer_notes: '' },
    gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
    credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
    completed_courses: [],
    in_progress_courses: [],
    career_interests: [],
    notes: ''
  };

  // ── Case 1: Partially-done pick-one slot ───────────────────────────────────
  it('pick-one unsatisfied tech slot emits note-form remaining entry', () => {
    // The CA tech core has a single required_elective (ECE 360C) — but we test
    // using a fixture that has a PickOne core_lab (ECE 445L / ECE 461L).
    const seTrack: TechCoreTrack = {
      ...mockTechCore,
      required_courses: {
        advanced_math: { id: 'M 325K', title: 'Discrete Math' },
        core: [{ id: 'ECE 316', title: 'Digital Logic' }],
        core_lab: {
          options: [
            { id: 'ECE 445L', title: 'Embedded Lab' },
            { id: 'ECE 461L', title: 'SE Lab' }
          ],
          pick: 1
        },
        required_elective: { id: 'ECE 360C', title: 'Algorithms' }
      },
    };

    // User has satisfied the advanced_math slot but NOT core_lab (pick-one)
    const profile: UserProfile = {
      ...emptyProfile,
      completed_courses: [
        { course: 'M 325K', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        { course: 'ECE 316', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
      ],
    };

    const result = computeProgress({}, profile, mockCatalog, mockDegreeReqs, seTrack);
    const techBucket = result.buckets.find((b) => b.id === 'tech')!;

    // The pick-one core_lab slot is unsatisfied → a note entry
    const coreLabEntry = techBucket.remaining?.find((r) => r.note?.includes('any of'));
    expect(coreLabEntry).toBeDefined();
    expect(coreLabEntry?.note).toMatch(/ECE 445L/);
    expect(coreLabEntry?.note).toMatch(/ECE 461L/);
    // advanced_math (M 325K) and ECE 316 ARE satisfied so they should NOT appear in remaining
    const advMathEntry = techBucket.remaining?.find((r) => r.courseId === 'M 325K');
    expect(advMathEntry).toBeUndefined();
  });

  // ── Case 1b: PickOne required_elective — options[1] taken, options[0] not ───
  it('pick-one required_elective satisfied by options[1] counts as done, not in remaining', () => {
    // Real SE track: required_elective has options [ECE 316, ECE 445L].
    // User takes ECE 445L (options[1]) but NOT ECE 316 (options[0]).
    // Expect: slot counted satisfied, absent from remaining[].
    const realCatalog = loadJson<CourseCatalog>('course-catalog.json');
    const realDegreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
    const techCores = loadJson<TechCores>('tech-cores.json');
    const seTrack = techCores.software_engineering; // required_elective.options = [ECE 316, ECE 445L]

    const profile: UserProfile = {
      ...emptyProfile,
      completed_courses: [
        // Satisfy advanced_math + 2 core courses so the required_elective is the focus
        { course: 'M 325K', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        { course: 'ECE 422C', title: '', grade: 'A', semester: '', type: '', credit_hours: 4 },
        { course: 'ECE 360C', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        // Take options[1] of required_elective — NOT options[0] (ECE 316)
        { course: 'ECE 445L', title: '', grade: 'A', semester: '', type: '', credit_hours: 4 },
      ],
    };

    const result = computeProgress({}, profile, realCatalog, realDegreeReqs, seTrack);
    const techBucket = result.buckets.find((b) => b.id === 'tech')!;

    // The required_elective slot must be marked satisfied (ECE 445L covers it)
    const reqElecEntry = techBucket.remaining?.find(
      (r) => r.note?.includes('ECE 316') && r.note?.includes('ECE 445L')
    );
    expect(reqElecEntry).toBeUndefined(); // slot is satisfied → not in remaining

    // ECE 445L should not appear as a missing courseId entry
    const ece445Entry = techBucket.remaining?.find((r) => r.courseId === 'ECE 445L');
    expect(ece445Entry).toBeUndefined();

    // Tech core count must include the required_elective slot (advanced_math + 2 core + required_elective = 4)
    expect(result.techCoreCompleted).toBeGreaterThanOrEqual(4);
  });

  // ── Case 2: Fully-satisfied bucket → remaining[] empty, complete: true ─────
  it('fully-satisfied math bucket has empty remaining[] and complete: true', () => {
    // Give the user all 4 math sequence courses
    const profile: UserProfile = {
      ...emptyProfile,
      completed_courses: [
        { course: 'M 408C', title: '', grade: 'A', semester: '', type: '', credit_hours: 4 },
        { course: 'M 408D', title: '', grade: 'A', semester: '', type: '', credit_hours: 4 },
        { course: 'M 427J', title: '', grade: 'A', semester: '', type: '', credit_hours: 4 },
        { course: 'M 340L', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
      ],
    };

    const result = computeProgress({}, profile, mockCatalog, mockDegreeReqs, mockTechCore);
    const mathBucket = result.buckets.find((b) => b.id === 'math')!;

    expect(mathBucket.complete).toBe(true);
    expect(mathBucket.remaining).toEqual([]);
    expect(mathBucket.doneHours).toBe(15);
  });

  // ── Case 3: Over-cap bucket fill clamps, remaining[] empty ─────────────────
  it('over-cap free-electives bucket: doneHours clamps at totalHours, remaining empty', () => {
    // freeElecTotal is computed as: total_credit_hours − (eceCoreHrs + mathHrs + physicsHrs + techHrs + genEdHrs)
    // Mock bucket sums: ece_core=36, math=15, physics=8, tech=26, gen_ed=6 → fixed sum = 91
    // Set total_credit_hours=100 → freeElecTotal = 100−91 = 9.
    // User has 15 hrs of advanced ECE electives → doneHours clamps to 9.
    const tightDegreeReqs: DegreeRequirements = { ...mockDegreeReqs, total_credit_hours: 100 };

    const bigCatalog: CourseCatalog = {
      ...mockCatalog,
      'ECE 360G': { id: 'ECE 360G', title: 'Graph Theory', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
      'ECE 371P': { id: 'ECE 371P', title: 'DSP', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
      'ECE 380J': { id: 'ECE 380J', title: 'Info Theory', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
      'ECE 381K': { id: 'ECE 381K', title: 'Multi-Rate DSP', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
      'ECE 382M': { id: 'ECE 382M', title: 'Signal Processing', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    };
    const profile: UserProfile = {
      ...emptyProfile,
      completed_courses: [
        // 5 non-core non-tech-core advanced ECE courses = 15 hrs > freeElecTotal(9)
        { course: 'ECE 360G', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        { course: 'ECE 371P', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        { course: 'ECE 380J', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        { course: 'ECE 381K', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
        { course: 'ECE 382M', title: '', grade: 'A', semester: '', type: '', credit_hours: 3 },
      ],
    };

    const result = computeProgress({}, profile, bigCatalog, tightDegreeReqs, mockTechCore);
    const freeElecBucket = result.buckets.find((b) => b.id === 'free_elec')!;

    // doneHours clamps at totalHours (9), never exceeds it
    expect(freeElecBucket.totalHours).toBe(9);
    expect(freeElecBucket.doneHours).toBe(9);
    expect(freeElecBucket.complete).toBe(true);
    // No negative gap → remaining is empty
    expect(freeElecBucket.remaining).toEqual([]);
  });

  // ── Case 4: Adi real-data characterization ─────────────────────────────────
  it('Adi real-data: ECE Core has 6 remaining courses, Math bucket complete', () => {
    const catalog = loadJson<CourseCatalog>('course-catalog.json');
    const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
    const techCores = loadJson<TechCores>('tech-cores.json');
    const adiProfile = loadJson<UserProfile>('user-profile.json');
    // Use CA+ES track (Adi's declared track)
    const techCore = techCores.computer_architecture;

    const result = computeProgress({}, adiProfile, catalog, degreeReqs, techCore);

    // ECE Core: Adi has ECE 302→402, ECE 306→406, ECE 312H→412, ECE 319H→419K done (4/10)
    // Remaining: ECE 411, ECE 313, ECE 333T, ECE 351K, ECE 364D, ECE 464K
    const eceCoreBucket = result.buckets.find((b) => b.id === 'ece_core')!;
    expect(eceCoreBucket.complete).toBe(false);
    const remainingIds = (eceCoreBucket.remaining ?? []).map((r) => r.courseId).filter(Boolean);
    expect(remainingIds).toContain('ECE 411');
    expect(remainingIds).toContain('ECE 313');
    expect(remainingIds).toContain('ECE 333T');
    expect(remainingIds).toContain('ECE 351K');
    expect(remainingIds).toContain('ECE 364D');
    expect(remainingIds).toContain('ECE 464K');
    expect(remainingIds).toHaveLength(6);

    // Math: M 508M→M 408C+M 408D, M 411→M 340L, M 427J direct → all 4 satisfied
    const mathBucket = result.buckets.find((b) => b.id === 'math')!;
    expect(mathBucket.complete).toBe(true);
    expect(mathBucket.remaining).toEqual([]);
    expect(mathBucket.doneHours).toBe(15); // 4+4+4+3

    // Physics: Adi has no physics courses → all 4 remain
    const physicsBucket = result.buckets.find((b) => b.id === 'physics')!;
    expect(physicsBucket.complete).toBe(false);
    const physRemaining = (physicsBucket.remaining ?? []).map((r) => r.courseId);
    expect(physRemaining).toContain('PHY 303K');
    expect(physRemaining).toContain('PHY 105M');
    expect(physRemaining).toContain('PHY 303L');
    expect(physRemaining).toContain('PHY 105N');

    // Gen-ed: 9 slots total, Adi has 3 (rhe, vapa, humanities) → 6 remaining
    const genEdBucket = result.buckets.find((b) => b.id === 'gen_ed')!;
    expect(genEdBucket.complete).toBe(false);
    expect(genEdBucket.doneCount).toBe(3);
    expect(genEdBucket.totalCount).toBe(9);
    expect(genEdBucket.subRequirements).toHaveLength(9);
    // Confirm completed slots are marked done
    const rheSub = genEdBucket.subRequirements?.find((s) => s.label === 'Rhetoric & Writing');
    expect(rheSub?.status).toBe('done');
    // Confirm an uncompleted slot is marked missing
    const govSub = genEdBucket.subRequirements?.find((s) => s.label === 'American Government I');
    expect(govSub?.status).toBe('missing');
  });

  // ── Dedupe check: gen-ed remaining[] has no duplicate courseIds ────────────
  it('gen-ed remaining[] has no duplicate courseIds (HIS 314K dedup)', () => {
    // The real degree-requirements.json has two US-History slots (his1, his2)
    // both sharing HIS 314K as their first option. When both are unsatisfied,
    // buildBucketViews must not emit HIS 314K twice in remaining[].
    const catalog = loadJson<CourseCatalog>('course-catalog.json');
    const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
    const techCores = loadJson<TechCores>('tech-cores.json');
    // Use an empty profile so all gen-ed slots are unsatisfied
    const emptyProfile: UserProfile = {
      name: '', eid: '', university: '', catalog_year: '', major: '', classification: '',
      first_semester: '', graduation_target: '',
      tech_core: { declared: '', status: '', required_math: '', required_ece: [], tech_electives_needed: 3 },
      secondary_aspirations: { math_ba: { status: '', notes: '' }, advanced_math_cert: { status: '', notes: '' }, jefferson_scholars_cert: { status: '', notes: '' } },
      preferences: { course_load: '', course_load_tolerance: '', time_preference: '', summer_courses: false, summer_notes: '' },
      gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
      credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
      completed_courses: [],
      in_progress_courses: [],
      career_interests: [],
      notes: '',
    };
    const techCore = techCores.software_engineering;
    const result = computeProgress({}, emptyProfile, catalog, degreeReqs, techCore);
    const genEdBucket = result.buckets.find((b) => b.id === 'gen_ed')!;
    const remainingCourseIds = (genEdBucket.remaining ?? [])
      .map((r) => r.courseId)
      .filter((id): id is string => id != null);
    const uniqueIds = new Set(remainingCourseIds);
    expect(remainingCourseIds).toHaveLength(uniqueIds.size);
  });
});
