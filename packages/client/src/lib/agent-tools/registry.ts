import type { ToolDefinition } from './types';
import { getCourseInfo } from './get-course-info';
import { getPrereqs } from './get-prereqs';
import { getDownstreamTool } from './get-downstream';
import { getGradeDistribution } from './get-grade-distribution';
import { findOfferingSemesters } from './find-offering-semesters';
import { proposePlanEdit } from './propose-plan-edit';
import { checkScheduleConflicts } from './check-schedule-conflicts';
import { listRemainingRequirements } from './list-remaining-requirements';
import { calculateGraduationImpact } from './calculate-graduation-impact';
import { findEasiestPath } from './find-easiest-path';
import { getProfessorHistory } from './get-professor-history';
import { getSectionInfo } from './get-section-info';
import { lookupUserProfile } from './lookup-user-profile';
import { getCreditProgress } from './get-credit-progress';
import { searchCatalog } from './search-catalog';

export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    name: 'get_course_info',
    description: 'Get full information about a course including title, credits, description, prerequisites, and grade data.',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID e.g. "ECE 302"' },
      },
      required: ['course_id'],
    },
    defaultEnabled: true,
    fn: getCourseInfo,
  },
  {
    name: 'get_prereqs',
    description: 'Get the direct prerequisites and corequisites for a course.',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID e.g. "ECE 302"' },
      },
      required: ['course_id'],
    },
    defaultEnabled: true,
    fn: getPrereqs,
  },
  {
    name: 'get_downstream',
    description: 'Get all courses that transitively depend on this course (courses unlocked by completing it).',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID e.g. "ECE 302"' },
      },
      required: ['course_id'],
    },
    defaultEnabled: true,
    fn: getDownstreamTool,
  },
  {
    name: 'get_grade_distribution',
    description: 'Get historical grade distribution statistics for a course including average GPA and letter-grade percentages.',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID e.g. "ECE 302"' },
      },
      required: ['course_id'],
    },
    defaultEnabled: true,
    fn: getGradeDistribution,
  },
  {
    name: 'find_offering_semesters',
    description: 'Find which semesters a course is offered (fall, spring, or both).',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID e.g. "ECE 302"' },
      },
      required: ['course_id'],
    },
    defaultEnabled: true,
    fn: findOfferingSemesters,
  },
  {
    name: 'propose_plan_edit',
    description: 'Propose adding, removing, or moving courses in the degree plan. The user must accept or reject the proposal — changes are never applied automatically.',
    schema: {
      type: 'object',
      properties: {
        operations: {
          type: 'array',
          description: 'List of plan edit operations',
          items: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  op: { type: 'string', enum: ['add'] },
                  courseId: { type: 'string' },
                  semesterId: { type: 'string' },
                },
                required: ['op', 'courseId', 'semesterId'],
              },
              {
                type: 'object',
                properties: {
                  op: { type: 'string', enum: ['remove'] },
                  courseId: { type: 'string' },
                  semesterId: { type: 'string' },
                },
                required: ['op', 'courseId', 'semesterId'],
              },
              {
                type: 'object',
                properties: {
                  op: { type: 'string', enum: ['move'] },
                  courseId: { type: 'string' },
                  fromSemesterId: { type: 'string' },
                  toSemesterId: { type: 'string' },
                },
                required: ['op', 'courseId', 'fromSemesterId', 'toSemesterId'],
              },
            ],
          },
        },
        reasoning: { type: 'string', description: 'Explanation of why this change is recommended' },
      },
      required: ['operations', 'reasoning'],
    },
    defaultEnabled: true,
    fn: proposePlanEdit,
  },
  {
    name: 'check_schedule_conflicts',
    description: 'Check for time conflicts between courses in a given semester.',
    schema: {
      type: 'object',
      properties: {
        semester_id: { type: 'string', description: 'Semester ID e.g. "Fall 2026"' },
      },
      required: ['semester_id'],
    },
    defaultEnabled: false,
    fn: checkScheduleConflicts,
  },
  {
    name: 'list_remaining_requirements',
    description: 'List all remaining degree requirements not yet satisfied by completed or planned courses.',
    schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    defaultEnabled: false,
    fn: listRemainingRequirements,
  },
  {
    name: 'calculate_graduation_impact',
    description: 'Estimate how removing a course from the plan would affect graduation by calculating how many downstream courses it blocks.',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID to analyze' },
      },
      required: ['course_id'],
    },
    defaultEnabled: false,
    fn: calculateGraduationImpact,
  },
  {
    name: 'find_easiest_path',
    description: 'Find the prerequisite chain leading to a target course, sorted by average GPA (easiest first).',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Target course ID' },
      },
      required: ['course_id'],
    },
    defaultEnabled: false,
    fn: findEasiestPath,
  },
  {
    name: 'get_professor_history',
    description: 'Get per-instructor grade statistics for a course.',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID e.g. "ECE 302"' },
      },
      required: ['course_id'],
    },
    defaultEnabled: false,
    fn: getProfessorHistory,
  },
  {
    name: 'get_section_info',
    description: 'Get current-term section details for a course: instructors, meeting times, enrollment status.',
    schema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'Course ID e.g. "ECE 302"' },
      },
      required: ['course_id'],
    },
    defaultEnabled: false,
    fn: getSectionInfo,
  },
  {
    name: 'lookup_user_profile',
    description: "Get Adi's academic profile including GPA, credit summary, preferences, and career interests.",
    schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    defaultEnabled: false,
    fn: lookupUserProfile,
  },
  {
    name: 'get_credit_progress',
    description: "Calculate credit hour progress toward graduation including completed, in-progress, and planned future hours.",
    schema: {
      type: 'object',
      properties: {},
      required: [],
    },
    defaultEnabled: false,
    fn: getCreditProgress,
  },
  {
    name: 'search_catalog',
    description: 'Search the course catalog by keyword, returning matching courses with GPA data.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (matches course ID, title, or description)' },
        department: { type: 'string', description: 'Optional department prefix filter e.g. "ECE"' },
        max_results: { type: 'number', description: 'Max results to return (default 20, max 50)' },
      },
      required: ['query'],
    },
    defaultEnabled: false,
    fn: searchCatalog,
  },
];

/** Tools enabled by default — sent to the model unless user overrides */
export const DEFAULT_ENABLED_TOOLS = TOOL_REGISTRY.filter(t => t.defaultEnabled);

/** Look up a tool by name */
export function getToolByName(name: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find(t => t.name === name);
}
