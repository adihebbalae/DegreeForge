import { z } from 'zod';
import type { UserProfile } from '../types';

// ─── Sub-schemas ───────────────────────────────────────────────────────────────

/**
 * Valid credit-source values. Default 'in_residence' ensures legacy profiles
 * (data without this field) parse correctly and behave as before — all
 * completed courses count toward term load, same as before this field existed.
 */
const creditSourceSchema = z.enum(['in_residence', 'ap', 'transfer', 'credit_by_exam']).default('in_residence');

const completedCourseSchema = z.object({
  course: z.string(),
  title: z.string(),
  grade: z.string(),
  semester: z.string(),
  type: z.string(),
  credit_hours: z.number().min(0).max(18),
  notes: z.string().optional(),
  // Default 'in_residence' so legacy stored profiles load without breaking.
  source: creditSourceSchema,
});

const inProgressCourseSchema = z.object({
  course: z.string(),
  title: z.string(),
  semester: z.string(),
  credit_hours: z.number().min(0).max(18),
  notes: z.string().optional(),
});

const gpaSchema = z.object({
  cumulative: z.number().min(0).max(4).default(0),
  lower_division: z.number().min(0).max(4).default(0),
  upper_division: z.number().min(0).max(4).default(0),
  gpa_hours: z.number().min(0).default(0),
  grade_points: z.number().min(0).default(0),
});

const creditSummarySchema = z.object({
  total_hours_transferred: z.number().default(0),
  total_hours_taken: z.number().default(0),
  total_hours: z.number().default(0),
});

const techCoreSchema = z.object({
  declared: z.string().default(''),
  status: z.string().default(''),
  required_math: z.string().default(''),
  required_ece: z.array(z.string()).default([]),
  tech_electives_needed: z.number().default(0),
});

const aspirationEntrySchema = z.object({
  status: z.string().default(''),
  notes: z.string().default(''),
});

const secondaryAspirationsSchema = z.object({
  math_ba: aspirationEntrySchema.default({ status: '', notes: '' }),
  advanced_math_cert: aspirationEntrySchema.default({ status: '', notes: '' }),
  jefferson_scholars_cert: aspirationEntrySchema.default({ status: '', notes: '' }),
});

const preferencesSchema = z.object({
  course_load: z.string().default(''),
  course_load_tolerance: z.string().default('above_average'),
  time_preference: z.string().default('no_preference'),
  summer_courses: z.boolean().default(false),
  summer_notes: z.string().default(''),
});

// ─── Top-level profile schema ─────────────────────────────────────────────────

// Annotate as ZodType<UserProfile> so TypeScript verifies structural compatibility
// at compile time — any field divergence becomes a tsc error here.
const profileStateSchema: z.ZodType<UserProfile> = z.object({
  name: z.string().default(''),
  eid: z.string().default(''),
  university: z.string().default('The University of Texas at Austin'),
  catalog_year: z.string().default('2024'),
  major: z.string().default('ece-bse'),
  classification: z.string().default(''),
  first_semester: z.string().default(''),
  graduation_target: z.string().default(''),
  tech_core: techCoreSchema.default({
    declared: '',
    status: '',
    required_math: '',
    required_ece: [],
    tech_electives_needed: 0,
  }),
  secondary_aspirations: secondaryAspirationsSchema.default({
    math_ba: { status: '', notes: '' },
    advanced_math_cert: { status: '', notes: '' },
    jefferson_scholars_cert: { status: '', notes: '' },
  }),
  preferences: preferencesSchema.default({
    course_load: '',
    course_load_tolerance: 'above_average',
    time_preference: 'no_preference',
    summer_courses: false,
    summer_notes: '',
  }),
  gpa: gpaSchema.default({ cumulative: 0, lower_division: 0, upper_division: 0, gpa_hours: 0, grade_points: 0 }),
  credit_summary: creditSummarySchema.default({
    total_hours_transferred: 0,
    total_hours_taken: 0,
    total_hours: 0,
  }),
  completed_courses: z.array(completedCourseSchema).default([]),
  in_progress_courses: z.array(inProgressCourseSchema).default([]),
  career_interests: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

/**
 * Validate and coerce raw untrusted data (localStorage, import) into a UserProfile.
 * Uses safeParse — never throws. Returns null on structural failure (missing required
 * non-defaultable fields); for lenient upgrade, per-field `.default()` fills missing
 * optional fields so old stored profiles continue to load.
 *
 * Pattern matches parsePlanState / parseSettingsState in plan-schema.ts.
 */
export function parseProfileState(raw: unknown): UserProfile | null {
  const result = profileStateSchema.safeParse(raw);
  return result.success ? result.data : null;
}
