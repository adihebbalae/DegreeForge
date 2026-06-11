/**
 * Tests for TASK-050: taken-vs-earned credit model.
 *
 * Verifies the core invariant: AP/transfer/credit_by_exam courses must NOT
 * count toward a semester's term load (N/cap hrs), but MUST still count
 * toward degree progress (X/128 hrs).
 */

import { describe, it, expect } from 'vitest';
import { buildTranscriptCredits, buildTermLoadCredits } from './course-utils';
import { computeProgress } from './progress';
import type {
  UserProfile,
  Plan,
  CourseCatalog,
  DegreeRequirements,
  TechCoreTrack,
} from '../types';

// ─── Minimal fixtures ─────────────────────────────────────────────────────────

function makeProfile(
  completedCourses: UserProfile['completed_courses']
): UserProfile {
  return {
    name: '',
    eid: '',
    university: '',
    catalog_year: '',
    major: '',
    classification: '',
    first_semester: '',
    graduation_target: '',
    tech_core: { declared: '', status: '', required_math: '', required_ece: [], tech_electives_needed: 0 },
    secondary_aspirations: {
      math_ba: { status: '', notes: '' },
      advanced_math_cert: { status: '', notes: '' },
      jefferson_scholars_cert: { status: '', notes: '' },
    },
    preferences: { course_load: '', course_load_tolerance: '', time_preference: '', summer_courses: false, summer_notes: '' },
    gpa: { cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 },
    credit_summary: { total_hours_transferred: 0, total_hours_taken: 0, total_hours: 0 },
    completed_courses: completedCourses,
    in_progress_courses: [],
    career_interests: [],
    notes: '',
  };
}

// ─── buildTermLoadCredits ────────────────────────────────────────────────────

describe('buildTermLoadCredits', () => {
  it('includes in_residence courses at full credit', () => {
    const profile = makeProfile([
      { course: 'ECE 302', title: '', grade: 'A', semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['ECE 302']).toBe(3);
  });

  it('maps AP credits to 0 (does not count toward term load)', () => {
    const profile = makeProfile([
      { course: 'M 408C', title: '', grade: 'CR', semester: 'Fall 2023', type: '', credit_hours: 4, source: 'ap' },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['M 408C']).toBe(0);
  });

  it('maps transfer credits to 0', () => {
    const profile = makeProfile([
      { course: 'ECE 306', title: '', grade: 'CR', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'transfer' },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['ECE 306']).toBe(0);
  });

  it('maps credit_by_exam credits to 0', () => {
    const profile = makeProfile([
      { course: 'RHE 306', title: '', grade: 'CR', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'credit_by_exam' },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['RHE 306']).toBe(0);
  });

  it('defaults missing source to in_residence (backward compat)', () => {
    // Existing stored profiles have no source field — must behave as in_residence.
    const profile = makeProfile([
      { course: 'ECE 302', title: '', grade: 'A', semester: 'Fall 2024', type: '', credit_hours: 3 },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['ECE 302']).toBe(3);
  });

  it('reproduces the 27/18 over-count: AP credits in a semester produce 0 load, not 9', () => {
    // Bug scenario: Fall 2023 has 18 hrs in_residence + 9 hrs AP = was showing 27/18.
    // After fix: AP courses map to 0, so load is 18 (correct).
    const profile = makeProfile([
      { course: 'ECE 302', title: '', grade: 'A', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'ECE 306', title: '', grade: 'A', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'ECE 316', title: '', grade: 'A', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'M 408C', title: '', grade: 'A', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'RHE 306', title: '', grade: 'A', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'UGS 303', title: '', grade: 'A', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'in_residence' },
      // AP credits placed in same semester — these must NOT count toward the load
      { course: 'M 408D', title: 'AP Calculus BC', grade: 'CR', semester: 'Fall 2023', type: '', credit_hours: 4, source: 'ap' },
      { course: 'GOV 310L', title: 'AP Government', grade: 'CR', semester: 'Fall 2023', type: '', credit_hours: 3, source: 'ap' },
      { course: 'HIS 315K', title: 'AP US History', grade: 'CR', semester: 'Fall 2023', type: '', credit_hours: 2, source: 'ap' },
    ]);

    const termLoad = buildTermLoadCredits(profile);
    const transcriptAll = buildTranscriptCredits(profile);

    // Term load: only in_residence courses (6 × 3 = 18), not AP (4+3+2=9)
    const termLoadSum = ['ECE 302', 'ECE 306', 'ECE 316', 'M 408C', 'RHE 306', 'UGS 303', 'M 408D', 'GOV 310L', 'HIS 315K']
      .reduce((s, id) => s + (termLoad[id] ?? 0), 0);
    expect(termLoadSum).toBe(18); // was 27 before fix

    // Degree progress (transcript): all 9 courses (18 + 9 = 27 total hrs)
    const transcriptSum = ['ECE 302', 'ECE 306', 'ECE 316', 'M 408C', 'RHE 306', 'UGS 303', 'M 408D', 'GOV 310L', 'HIS 315K']
      .reduce((s, id) => s + (transcriptAll[id] ?? 0), 0);
    expect(transcriptSum).toBe(27); // full degree credit preserved
  });
});

// ─── H3: type-field detection (demo profile format) ─────────────────────────
// The demo profile uses `type: "Transfer"` / `"Credit by exam"` with no `source`
// field (or source defaulting to absent/in_residence). buildTermLoadCredits must
// honour `type` as the authority when `source` is absent.
describe('buildTermLoadCredits — H3 type-field detection', () => {
  it('type="Transfer" with absent source → 0 term-load credit', () => {
    const profile = makeProfile([
      { course: 'M 411', title: 'Linear Algebra', grade: 'B', semester: 'Fall 2024', type: 'Transfer', credit_hours: 4 },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['M 411']).toBe(0);
  });

  it('type="Credit by exam" with absent source → 0 term-load credit', () => {
    const profile = makeProfile([
      { course: 'M 408C', title: 'Calc I', grade: 'CR', semester: 'Summer 2025', type: 'Credit by exam', credit_hours: 4 },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['M 408C']).toBe(0);
  });

  it('type="In residence" with absent source → full credit', () => {
    const profile = makeProfile([
      { course: 'ECE 302', title: 'Intro EE', grade: 'B+', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
    ]);
    const map = buildTermLoadCredits(profile);
    expect(map['ECE 302']).toBe(3);
  });

  it('buildTranscriptCredits still counts Transfer/exam courses for degree progress', () => {
    const profile = makeProfile([
      { course: 'M 411', title: 'Linear Algebra', grade: 'B', semester: 'Fall 2024', type: 'Transfer', credit_hours: 4 },
      { course: 'M 408C', title: 'Calc I', grade: 'CR', semester: 'Summer 2025', type: 'Credit by exam', credit_hours: 4 },
    ]);
    const allCredits = buildTranscriptCredits(profile);
    expect(allCredits['M 411']).toBe(4);
    expect(allCredits['M 408C']).toBe(4);
  });
});

// ─── buildTranscriptCredits (degree progress — unchanged behavior) ────────────

describe('buildTranscriptCredits', () => {
  it('includes ALL completed courses regardless of source', () => {
    const profile = makeProfile([
      { course: 'ECE 302', title: '', grade: 'A', semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'M 408C', title: '', grade: 'CR', semester: '', type: '', credit_hours: 4, source: 'ap' },
      { course: 'ECE 306', title: '', grade: 'CR', semester: '', type: '', credit_hours: 3, source: 'transfer' },
    ]);
    const map = buildTranscriptCredits(profile);
    expect(map['ECE 302']).toBe(3);
    expect(map['M 408C']).toBe(4);
    expect(map['ECE 306']).toBe(3);
  });
});

// ─── computeProgress: AP course counts toward degree total, not term load ─────

describe('computeProgress with AP credits', () => {
  const mockCatalog: CourseCatalog = {
    'ECE 302': { id: 'ECE 302', title: 'Intro to EE', credits: 3, department: 'ECE', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
    'M 408C': { id: 'M 408C', title: 'Calc I', credits: 4, department: 'Math', description: '', prerequisites: [], corequisites: [], grading: 'letter' },
  };

  const mockDegreeReqs: DegreeRequirements = {
    ece_core: { courses: ['ECE 302'], notes: '', honors_variants: {}, senior_design_options: [] },
    core_curriculum: { slots: [] },
    tech_core: {
      description: '',
      components: {
        advanced_math: { hours: '3', count: 1 },
        core_courses: { hours: '3', count: 1 },
        core_lab: { hours: '3', count: 1 },
        tech_electives: { hours_min: 3, count: '1' },
      },
      notes: '',
    },
    advanced_tech_elective: { count: 0, hours: '0', description: '' },
    free_electives: { total_hours: 0, constraints: [], approved_list_url: '' },
    math_sequence: { required: [], alternate_calculus: [], notes: '' },
    physics_sequence: { required: [], alternate: [], notes: '' },
    total_credit_hours: 128,
    notes: '',
  };

  const mockTechCore: TechCoreTrack = {
    name: 'Test',
    graduate_track: '',
    category: 'CE',
    required_math: '',
    required_courses: {},
    elective_count: { general: 0, ecb: 0 },
    elective_pool: [],
  };

  it('AP credit counts toward degree total (X/128) even when not in any semester plan', () => {
    // M 408C taken via AP — appears in completed_courses with source: 'ap'
    const profile = makeProfile([
      { course: 'ECE 302', title: '', grade: 'A', semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'M 408C', title: '', grade: 'CR', semester: '', type: '', credit_hours: 4, source: 'ap' },
    ]);

    const plan: Plan = {};
    const result = computeProgress(plan, profile, mockCatalog, {}, mockDegreeReqs, mockTechCore);

    // ECE 302 (3) + M 408C AP (4) = 7 total hours toward degree
    expect(result.totalHours).toBe(7);
  });

  it('AP course does not count toward term load when placed in a semester', () => {
    // Scenario: AP credit placed in Fall 2024, in_residence course also there.
    // The term-load map is used by SemesterTile/SemesterColumn (not computeProgress).
    // Verify via buildTermLoadCredits.
    const profile = makeProfile([
      { course: 'ECE 302', title: '', grade: 'A', semester: 'Fall 2024', type: '', credit_hours: 3, source: 'in_residence' },
      { course: 'M 408C', title: '', grade: 'CR', semester: 'Fall 2024', type: '', credit_hours: 4, source: 'ap' },
    ]);

    const termLoad = buildTermLoadCredits(profile);

    // In-residence: 3 hrs; AP: 0 hrs (not counted in load)
    expect(termLoad['ECE 302']).toBe(3);
    expect(termLoad['M 408C']).toBe(0);

    // Degree progress still includes both
    const allCredits = buildTranscriptCredits(profile);
    expect(allCredits['ECE 302']).toBe(3);
    expect(allCredits['M 408C']).toBe(4);
  });
});
