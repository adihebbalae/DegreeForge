/**
 * agent-tools/types.ts
 *
 * Shared types for the provider-agnostic agentic tool registry.
 */

import type {
  CourseCatalog,
  PrereqGraphData,
  GradeDistributions,
  UserProfile,
  DegreeRequirements,
  TechCores,
  OfferingSchedule,
  FallSections,
  Plan,
  Semester,
} from '../../types';

// ─── Tool Context ─────────────────────────────────────────────────────────────

/**
 * All read-only data available to every tool function.
 * Tools MUST NOT mutate any field here — they return proposed changes instead.
 */
export interface ToolContext {
  catalog: CourseCatalog;
  prereqGraph: PrereqGraphData;
  gradeDistributions: GradeDistributions;
  userProfile: UserProfile;
  degreeRequirements: DegreeRequirements;
  techCores: TechCores;
  offeringSchedule: OfferingSchedule;
  fallSections: FallSections | null;
  /** Current plan state (semesterId → courseId[]) */
  plan: Plan;
  semesters: Semester[];
  /** Currently selected tech-core slug */
  techCoreId: string;
  /** Whether Math BA double-major is toggled on */
  mathBAToggle: boolean;
}

// ─── Tool Result ──────────────────────────────────────────────────────────────

export interface ToolResult {
  /** JSON-serializable content returned to the model */
  content: unknown;
  /** If true, the model should interpret this as an error */
  isError?: boolean;
}

// ─── Plan Edit Proposal (propose_plan_edit) ───────────────────────────────────

export type PlanEditOperation =
  | { op: 'add'; courseId: string; semesterId: string }
  | { op: 'remove'; courseId: string; semesterId: string }
  | { op: 'move'; courseId: string; fromSemesterId: string; toSemesterId: string };

export interface ProposedPlanEdit {
  operations: PlanEditOperation[];
  reasoning: string;
}

// ─── Tool Registry Entry ──────────────────────────────────────────────────────

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's input parameters */
  schema: Record<string, unknown>;
  /** Whether the tool is sent to the model by default */
  defaultEnabled: boolean;
  fn: (ctx: ToolContext, args: Record<string, unknown>) => ToolResult;
}
