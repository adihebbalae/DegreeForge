// ─── Course Catalog ──────────────────────────────────────────────────────────
export interface CatalogCourse {
  id: string;
  title: string;
  credits: number;
  description: string;
  prerequisites: string[];
  corequisites: string[];
  grading: string;
  department: string;
}

/** course-catalog.json top-level — keyed by course ID e.g. "ECE 302" */
export type CourseCatalog = Record<string, CatalogCourse>;

// ─── Prerequisite Graph ──────────────────────────────────────────────────────
export interface PrereqNode {
  title: string;
  credits: number;
  category: string;
  offered: string[];
  flags: string[];
}

export interface PrereqEdge {
  from: string;
  to: string;
  type: 'prerequisite' | 'corequisite';
  min_grade?: string;
}

/** prerequisite-graph.json — raw data shape (use PrereqGraph class from graph-engine for logic) */
export interface PrereqGraphData {
  nodes: Record<string, PrereqNode>;
  edges: PrereqEdge[];
}

// ─── Grade Distributions ─────────────────────────────────────────────────────
interface GradeSection {
  semester: string;
  /** unique section number */
  section: number;
  /** per-letter-grade counts */
  grades: Record<string, number>;
  a_pct: number;
  b_pct: number;
  c_pct: number;
  d_pct: number;
  f_pct: number;
  enrollment: number;
  gpa: number;
}

/**
 * Per-instructor grade statistics for a course.
 *
 * Instructor name format: "First [Middle] Last" — verbatim from
 * fall-2026-sections.json (e.g. "Nina K Telang", "Shyam Shankar").
 * Sections with no instructor listed are keyed as "Unknown".
 *
 * NOTE: As of 2026-05-18 the source CSVs (UTGradesPlus 2021-2026) do not
 * include an instructor column. Values are estimated by attributing a
 * proportional share of the course-level aggregate to each instructor based
 * on their Fall 2026 section count. Per-instructor accuracy will improve when
 * UTGradesPlus exports include instructor names.
 */
export interface InstructorGradeStats {
  avg_gpa: number;
  total_enrollment: number;
  /** Grade letter → student count */
  distribution: Record<string, number>;
}

export interface GradeDistribution {
  department: string;
  /** Always "ECE" after normalization (was "E E" for older sections) */
  department_code: string;
  course_number: string;
  course_title: string;
  sections: GradeSection[];
  avg_gpa: number;
  a_pct: number;
  b_pct: number;
  c_pct: number;
  d_pct: number;
  f_pct: number;
  total_enrollment: number;
  total_sections: number;
  /**
   * Per-instructor grade statistics. Populated by scripts/grade-dist/reparse.ts.
   * Key: instructor full name ("First [Middle] Last") or "Unknown".
   * Present on all entries after reparse; empty object {} if no instructor
   * data is available for that course. Optional for backward compatibility
   * with test fixtures and data produced before TASK-028.
   */
  byInstructor?: Record<string, InstructorGradeStats>;
}

/** grade-distributions.json — after normalization: keyed by "ECE NNN" */
export type GradeDistributions = Record<string, GradeDistribution>;

// ─── User Profile ────────────────────────────────────────────────────────────
interface CompletedCourse {
  course: string;
  title: string;
  grade: string;
  semester: string;
  type: string;
  credit_hours: number;
  notes?: string;
}

interface InProgressCourse {
  course: string;
  title: string;
  semester: string;
  credit_hours: number;
  notes?: string;
}

interface UserGpa {
  cumulative: number;
  lower_division: number;
  upper_division: number;
  gpa_hours: number;
  grade_points: number;
}

interface UserCreditSummary {
  total_hours_transferred: number;
  total_hours_taken: number;
  total_hours: number;
}

interface UserTechCore {
  declared: string;
  status: string;
  required_math: string;
  required_ece: string[];
  tech_electives_needed: number;
}

interface SecondaryAspirationEntry {
  status: string;
  notes: string;
}

interface UserSecondaryAspirations {
  math_ba: SecondaryAspirationEntry;
  advanced_math_cert: SecondaryAspirationEntry;
  jefferson_scholars_cert: SecondaryAspirationEntry;
}

interface UserPreferences {
  course_load: string;
  course_load_tolerance: string;
  time_preference: string;
  summer_courses: boolean;
  summer_notes: string;
}

/** user-profile.json */
export interface UserProfile {
  name: string;
  eid: string;
  university: string;
  catalog_year: string;
  major: string;
  classification: string;
  first_semester: string;
  graduation_target: string;
  tech_core: UserTechCore;
  secondary_aspirations: UserSecondaryAspirations;
  preferences: UserPreferences;
  gpa: UserGpa;
  credit_summary: UserCreditSummary;
  completed_courses: CompletedCourse[];
  in_progress_courses: InProgressCourse[];
  career_interests: string[];
  notes: string;
}

// ─── Degree Requirements ─────────────────────────────────────────────────────
interface CoreCurriculumSlot {
  id: string;
  label: string;
  hours: number;
  core_code: string;
  options: string[];
  ap_eligible: boolean;
  prereq?: string;
  notes?: string;
}

interface EceCoreRequirements {
  courses: string[];
  notes: string;
  honors_variants: Record<string, string>;
  senior_design_options: string[];
}

interface CoreCurriculumRequirements {
  slots: CoreCurriculumSlot[];
}

interface TechCoreComponentSpec {
  hours: string;
  count: number;
}

interface TechElectiveComponentSpec {
  hours_min: number;
  count: string;
}

interface TechCoreComponents {
  advanced_math: TechCoreComponentSpec;
  core_courses: TechCoreComponentSpec;
  core_lab: TechCoreComponentSpec;
  tech_electives: TechElectiveComponentSpec;
}

interface TechCoreBlock {
  description: string;
  components: TechCoreComponents;
  notes: string;
}

interface AdvancedTechElective {
  count: number;
  hours: string;
  description: string;
}

interface FreeElectivesRequirements {
  total_hours: number;
  constraints: string[];
  approved_list_url: string;
}

interface MathSequenceRequirements {
  required: string[];
  alternate_calculus: string[];
  notes: string;
}

interface PhysicsSequenceRequirements {
  required: string[];
  alternate: string[];
  notes: string;
}

/** degree-requirements.json */
export interface DegreeRequirements {
  ece_core: EceCoreRequirements;
  core_curriculum: CoreCurriculumRequirements;
  tech_core: TechCoreBlock;
  advanced_tech_elective: AdvancedTechElective;
  free_electives: FreeElectivesRequirements;
  math_sequence: MathSequenceRequirements;
  physics_sequence: PhysicsSequenceRequirements;
  total_credit_hours: number;
  notes: string;
}

// ─── Tech Cores ──────────────────────────────────────────────────────────────
interface TechCourseRef {
  id: string;
  title: string;
}

export interface TechCorePickOne {
  options: TechCourseRef[];
  pick: number;
}

/** A required course slot is either a single required course or a pick-N group */
export type TechCoreCourseEntry = TechCourseRef | TechCorePickOne;

/** Type guard: is this a pick-one group? */
export function isTechCorePickOne(entry: TechCoreCourseEntry): entry is TechCorePickOne {
  return 'options' in entry;
}

interface TechCoreRequiredCourses {
  advanced_math?: TechCourseRef;
  core?: TechCoreCourseEntry[];
  core_lab?: TechCorePickOne | TechCourseRef;
  required_elective?: TechCourseRef;
}

interface TechCoreElectiveCount {
  general: number;
  ecb: number;
}

export interface TechCoreTrack {
  name: string;
  graduate_track: string;
  category: string;
  required_math: string;
  required_courses: TechCoreRequiredCourses;
  elective_count: TechCoreElectiveCount;
  elective_pool: string[];
}

/** tech-cores.json — keyed by track slug e.g. "computer_architecture_embedded_systems" */
export type TechCores = Record<string, TechCoreTrack>;

// ─── Offering Schedule ───────────────────────────────────────────────────────
interface OfferingEntry {
  title: string;
  /** keys like "fall_25", "spring_26" → offered that semester? */
  offerings: Record<string, boolean>;
  offered_semesters: string[];
}

/** offering-schedule.json — keyed by course ID e.g. "ECE 325" */
export type OfferingSchedule = Record<string, OfferingEntry>;

// ─── Math Requirements ───────────────────────────────────────────────────────
interface MathRequirementItem {
  id: string;
  label: string;
  hours: number;
  note?: string;
  choose_one_sequence?: string[][];
  options?: string[];
}

interface MathBaOverlap {
  course: string;
  satisfies: string;
  ece_context: string;
}

interface MathBaAdditionalCourse {
  requirement: string;
  hours: number;
  example: string;
}

interface MathBaAdditionalCourses {
  note: string;
  minimum_additional_hours: number;
  breakdown: MathBaAdditionalCourse[];
}

interface MathBaRequirements {
  program_name: string;
  catalog_url: string;
  total_upper_division_hours: number;
  requirements: MathRequirementItem[];
  overlap_with_ece: MathBaOverlap[];
  additional_courses_needed: MathBaAdditionalCourses;
}

/** math-requirements.json */
export interface MathRequirements {
  math_ba: MathBaRequirements;
}

// ─── Fall 2026 Sections ──────────────────────────────────────────────────────
export interface SectionMeeting {
  days?: string;
  time: string;
  room?: string;
}

export interface CourseSection {
  unique: number;
  meetings: SectionMeeting[];
  instruction_mode: string;
  instructor: string;
  status: string;
  core: string;
}

export interface CourseSections {
  course: string;
  title: string;
  sections: CourseSection[];
}

/** Per-term sections file, e.g. fall-2026.json */
export interface FallSections {
  semester: string;
  semester_code: string;
  source: string;
  courses: Record<string, CourseSections>;
}

/** Entry in sections-index.json */
interface SectionsIndexEntry {
  slug: string;
  label: string;
  code: string;
  file: string;
}

/** sections-index.json — manifest of available per-term section files */
export interface SectionsIndex {
  default_term: string;
  terms: SectionsIndexEntry[];
}

export interface PrereqViolation {
  /** The course whose placement is invalid */
  courseId: string;
  /** The semester it was (mis)placed in */
  semesterId: string;
  /** Prerequisites that are not yet completed before this semester */
  missingPrereqs: string[];
  /** Corequisites not placed in same or earlier semester */
  unsatisfiedCoreqs: string[];
  violationType: 'prereq' | 'coreq' | 'both';
}

// ─── Plan State ──────────────────────────────────────────────────────────────
export type SemesterId = string; // e.g. "Fall 2025", "Spring 2026"

/** semesterId → courseId[] */
export type Plan = Record<SemesterId, string[]>;

export interface Semester {
  id: string;         // "Fall 2025"
  label: string;      // "Fall '25" or "Sp '26"
  status: 'past' | 'current' | 'future';
  year: number;
  season: 'Fall' | 'Spring' | 'Summer';
}

export interface WhatIfState {
  techCoreId: string;
  mathBAToggle: boolean;
  isActive: boolean;
}

export interface PlanState {
  semesters: Semester[];       // Ordered list of semester objects
  plan: Record<string, string[]>; // semesterId → courseId[]
  pinnedCourses: string[];     // Cannot be moved by solver
  hoveredCourse: string | null; // For downstream highlighting
  whatIf: WhatIfState;         // What-if simulation state (TASK-011)
  /** User-entered grades: semesterId → courseId → letter grade (e.g. "A-", "B+") */
  gradeEntries?: Record<string, Record<string, string>>;
  // TASK-019: ghost-card autocomplete
  ghostCourses: Record<string, string[]>; // semesterId → courseId[] (solver proposals)
  rejectedGhosts: string[];               // courseIds excluded from current ghost run
  focusedGhostId: string | null;          // which ghost Tab will accept
  // TASK-023: onboarding profile meta (forward-compat)
  major: string;               // e.g. 'ece-bse'
  catalogYear: string;         // e.g. '2024'
}

/** Display category for color-coding course cards */
export type CourseCategory = 'ece_core' | 'tech_core' | 'gen_ed' | 'elective' | 'math';

export interface ChatCourseRef {
  course: string;
  title: string;
}

export interface ChatPlanContext {
  techCore: string;
  completedCourses: ChatCourseRef[];
  inProgress: ChatCourseRef[];
  targetGraduation: string;
  totalCoursesPlanned: number;
  semesterCount: number;
}
