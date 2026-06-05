import type { UserProfile, DegreeRequirements } from '@/types';

/**
 * Fallback UserProfile used when the DataContext has not yet loaded profile data.
 * Provides structurally valid defaults so tool invocations don't crash.
 */
export function makeDefaultUserProfile(techCoreId: string): UserProfile {
  return {
    name: '', eid: '', university: '', catalog_year: '', major: 'ECE',
    classification: 'Sophomore', first_semester: '', graduation_target: '',
    tech_core: { declared: techCoreId, status: 'declared', required_math: '', required_ece: [], tech_electives_needed: 0 },
    secondary_aspirations: {
      math_ba: { status: 'not_pursuing', notes: '' },
      advanced_math_cert: { status: 'not_pursuing', notes: '' },
      jefferson_scholars_cert: { status: 'not_pursuing', notes: '' },
    },
    preferences: { course_load: 'moderate', course_load_tolerance: 'moderate', time_preference: 'morning', summer_courses: false, summer_notes: '' },
    gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
    credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
    completed_courses: [],
    in_progress_courses: [],
    career_interests: [],
    notes: '',
  };
}

/**
 * Fallback DegreeRequirements used when the DataContext has not yet loaded requirements data.
 * Provides structurally valid defaults so tool invocations don't crash.
 */
export const DEFAULT_DEGREE_REQUIREMENTS: DegreeRequirements = {
  ece_core: { courses: [], notes: '', honors_variants: {}, senior_design_options: [] },
  core_curriculum: { slots: [] },
  tech_core: { description: '', components: { advanced_math: { hours: '3', count: 1 }, core_courses: { hours: '3', count: 3 }, core_lab: { hours: '1', count: 1 }, tech_electives: { hours_min: 3, count: '3' } }, notes: '' },
  advanced_tech_elective: { count: 1, hours: '3', description: '' },
  free_electives: { total_hours: 6, constraints: [], approved_list_url: '' },
  math_sequence: { required: [], alternate_calculus: [], notes: '' },
  physics_sequence: { required: [], alternate: [], notes: '' },
  total_credit_hours: 128,
  notes: '',
};
