/**
 * Shared minimal fixture data for agent-tools tests.
 * All tools receive a ToolContext — this provides the minimum fields needed.
 */
import type { ToolContext } from '../types';

export const FIXTURE_CTX: ToolContext = {
  catalog: {
    'ECE 302': {
      id: 'ECE 302',
      title: 'Intro to Electrical Engineering',
      credits: 3,
      description: 'Fundamentals of EE.',
      prerequisites: ['M 408C'],
      corequisites: [],
      grading: 'Regular',
      department: 'ECE',
    },
    'ECE 306': {
      id: 'ECE 306',
      title: 'Introduction to Computing',
      credits: 3,
      description: 'Computing fundamentals.',
      prerequisites: ['M 408C'],
      corequisites: [],
      grading: 'Regular',
      department: 'ECE',
    },
    'ECE 312': {
      id: 'ECE 312',
      title: 'Software Design',
      credits: 3,
      description: 'Software design patterns.',
      prerequisites: ['ECE 306'],
      corequisites: [],
      grading: 'Regular',
      department: 'ECE',
    },
    'ECE 460N': {
      id: 'ECE 460N',
      title: 'Computer Architecture',
      credits: 3,
      description: 'Advanced architecture.',
      prerequisites: ['ECE 312'],
      corequisites: [],
      grading: 'Regular',
      department: 'ECE',
    },
    'M 408C': {
      id: 'M 408C',
      title: 'Differential Calculus',
      credits: 4,
      description: 'Calculus basics.',
      prerequisites: [],
      corequisites: [],
      grading: 'Regular',
      department: 'M',
    },
  },

  prereqGraph: {
    nodes: {
      'ECE 302': { title: 'Intro EE', category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
      'ECE 306': { title: 'Intro Computing', category: 'ece_core', offered: ['fall', 'spring'], flags: [] },
      'ECE 312': { title: 'Software Design', category: 'ece_core', offered: ['spring'], flags: [] },
      'ECE 460N': { title: 'Computer Architecture', category: 'tech_core', offered: ['fall'], flags: [] },
      'M 408C': { title: 'Diff Calculus', category: 'math', offered: ['fall', 'spring'], flags: [] },
    },
    edges: [
      { from: 'M 408C', to: 'ECE 302', type: 'prerequisite' },
      { from: 'M 408C', to: 'ECE 306', type: 'prerequisite' },
      { from: 'ECE 306', to: 'ECE 312', type: 'prerequisite' },
      { from: 'ECE 312', to: 'ECE 460N', type: 'prerequisite' },
    ],
  },

  gradeDistributions: {
    'ECE 302': {
      department: 'Electrical and Computer Engineering',
      department_code: 'ECE',
      course_number: '302',
      course_title: 'Intro EE',
      sections: [],
      avg_gpa: 2.8,
      a_pct: 30,
      b_pct: 40,
      c_pct: 20,
      d_pct: 7,
      f_pct: 3,
      total_enrollment: 500,
      total_sections: 10,
      byInstructor: {
        'Alice Smith': { avg_gpa: 3.1, total_enrollment: 200, distribution: { A: 80, B: 80, C: 40 } },
        'Bob Jones': { avg_gpa: 2.5, total_enrollment: 300, distribution: { A: 60, B: 120, C: 80, D: 40 } },
      },
    },
    'ECE 306': {
      department: 'Electrical and Computer Engineering',
      department_code: 'ECE',
      course_number: '306',
      course_title: 'Intro Computing',
      sections: [],
      avg_gpa: 3.1,
      a_pct: 45,
      b_pct: 35,
      c_pct: 15,
      d_pct: 4,
      f_pct: 1,
      total_enrollment: 600,
      total_sections: 12,
    },
  },

  userProfile: {
    name: 'Adi Test',
    eid: 'at12345',
    university: 'UT Austin',
    catalog_year: '2024-2026',
    major: 'ECE',
    classification: 'Junior',
    first_semester: 'Fall 2025',
    graduation_target: 'Spring 2029',
    tech_core: {
      declared: 'computer_architecture',
      status: 'declared',
      required_math: 'M 341',
      required_ece: ['ECE 460N'],
      tech_electives_needed: 3,
    },
    secondary_aspirations: {
      math_ba: { status: 'not_pursuing', notes: '' },
      advanced_math_cert: { status: 'not_pursuing', notes: '' },
      jefferson_scholars_cert: { status: 'not_pursuing', notes: '' },
    },
    preferences: {
      course_load: 'moderate',
      course_load_tolerance: 'moderate',
      time_preference: 'morning',
      summer_courses: false,
      summer_notes: '',
    },
    gpa: { cumulative: 3.5, lower_division: 3.5, upper_division: 3.5, gpa_hours: 45, grade_points: 157.5 },
    credit_summary: { total_hours_transferred: 12, total_hours_taken: 45, total_hours: 57 },
    completed_courses: [
      { course: 'M 408C', title: 'Diff Calc', grade: 'A', semester: 'Fall 2025', type: 'math', credit_hours: 4 },
    ],
    in_progress_courses: [
      { course: 'ECE 302', title: 'Intro EE', semester: 'Spring 2026', credit_hours: 3 },
    ],
    career_interests: ['hardware', 'embedded systems'],
    notes: '',
  },

  degreeRequirements: {
    ece_core: {
      courses: ['ECE 302', 'ECE 306', 'ECE 312'],
      notes: '',
      honors_variants: {},
      senior_design_options: [],
    },
    core_curriculum: { slots: [] },
    tech_core: {
      description: 'Tech core',
      components: {
        advanced_math: { hours: '3', count: 1 },
        core_courses: { hours: '3', count: 3 },
        core_lab: { hours: '1', count: 1 },
        tech_electives: { hours_min: 3, count: '3' },
      },
      notes: '',
    },
    advanced_tech_elective: { count: 1, hours: '3', description: '' },
    free_electives: { total_hours: 6, constraints: [], approved_list_url: '' },
    math_sequence: { required: ['M 408C', 'M 408D'], alternate_calculus: [], notes: '' },
    physics_sequence: { required: ['PHY 303K', 'PHY 303L'], alternate: [], notes: '' },
    total_credit_hours: 128,
    notes: '',
  },

  techCores: {
    computer_architecture: {
      name: 'Computer Architecture',
      graduate_track: '',
      category: 'hardware',
      required_math: 'M 341',
      required_courses: {
        core: [{ id: 'ECE 460N', title: 'Computer Architecture' }],
      },
      elective_count: { general: 2, ecb: 1 },
      elective_pool: ['ECE 461', 'ECE 462'],
    },
  },

  offeringSchedule: {
    'ECE 302': {
      title: 'Intro EE',
      offerings: { fall_25: true, spring_26: true },
      offered_semesters: ['fall', 'spring'],
    },
    'ECE 306': {
      title: 'Intro Computing',
      offerings: { fall_25: true, spring_26: false },
      offered_semesters: ['fall'],
    },
  },

  fallSections: {
    semester: 'Fall 2026',
    semester_code: 'fall_26',
    source: 'test',
    courses: {
      'ECE 302': {
        course: 'ECE 302',
        title: 'Intro EE',
        sections: [
          {
            unique: 12345,
            meetings: [{ days: 'MWF', time: '9:00am - 10:00am', room: 'ETC 2.136' }],
            instruction_mode: 'In Person',
            instructor: 'Alice Smith',
            status: 'Open',
            core: '',
          },
        ],
      },
      'ECE 306': {
        course: 'ECE 306',
        title: 'Intro Computing',
        sections: [
          {
            unique: 12346,
            meetings: [{ days: 'MWF', time: '9:30am - 10:30am', room: 'ETC 2.102' }],
            instruction_mode: 'In Person',
            instructor: 'Bob Jones',
            status: 'Open',
            core: '',
          },
        ],
      },
    },
  },

  plan: {
    'Fall 2025': ['M 408C'],
    'Spring 2026': ['ECE 302'],
    'Fall 2026': ['ECE 306', 'ECE 312'],
    'Spring 2027': ['ECE 460N'],
  },

  semesters: [
    { id: 'Fall 2025', label: "Fall '25", status: 'past', year: 2025, season: 'Fall' },
    { id: 'Spring 2026', label: "Sp '26", status: 'current', year: 2026, season: 'Spring' },
    { id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall' },
    { id: 'Spring 2027', label: "Sp '27", status: 'future', year: 2027, season: 'Spring' },
  ],

  techCoreId: 'computer_architecture',
  mathBAToggle: false,
};
