import type { PlanEditOperation } from '@/lib/agent-tools/types';

/** Maximum operations a single tool turn may propose. */
export const MAX_OPS_PER_TURN = 20;

/** Recognised op types — must match PlanEditOperation['op'] */
const VALID_OPS = new Set<string>(['add', 'remove', 'move']);

export interface ValidationError {
  reason: string;
}

/**
 * Validate a single PlanEditOperation before dispatching to PlanContext.
 * Returns null if valid, or a ValidationError describing the problem.
 */
export function validateOp(
  op: PlanEditOperation,
  catalog: Record<string, unknown> | null,
  semesterIds: string[],
  plan: Record<string, string[]>
): ValidationError | null {
  if (!VALID_OPS.has(op.op)) {
    return { reason: `Unknown operation type "${op.op}".` };
  }

  if (!catalog || !(op.courseId in catalog)) {
    return { reason: `Course "${op.courseId}" is not in the catalog.` };
  }

  if (op.op === 'add') {
    if (!semesterIds.includes(op.semesterId)) {
      return { reason: `Semester "${op.semesterId}" does not exist in your plan.` };
    }
    // Duplicate check: course already placed in any semester
    const placedIn = semesterIds.find(sid => (plan[sid] ?? []).includes(op.courseId));
    if (placedIn) {
      return { reason: `"${op.courseId}" is already placed in ${placedIn}.` };
    }
  } else if (op.op === 'remove') {
    if (!semesterIds.includes(op.semesterId)) {
      return { reason: `Semester "${op.semesterId}" does not exist in your plan.` };
    }
  } else if (op.op === 'move') {
    if (!semesterIds.includes(op.fromSemesterId)) {
      return { reason: `Source semester "${op.fromSemesterId}" does not exist in your plan.` };
    }
    if (!semesterIds.includes(op.toSemesterId)) {
      return { reason: `Destination semester "${op.toSemesterId}" does not exist in your plan.` };
    }
    // Duplicate check: another placement of same course in toSemesterId (different from fromSemesterId)
    const alreadyInDest = (plan[op.toSemesterId] ?? []).includes(op.courseId);
    if (alreadyInDest) {
      return { reason: `"${op.courseId}" is already in ${op.toSemesterId}.` };
    }
  }

  return null;
}

/**
 * Validate an entire proposal's op-count before rendering.
 * Returns null if valid, or an error string.
 */
export function validateOpCount(ops: PlanEditOperation[]): string | null {
  if (ops.length > MAX_OPS_PER_TURN) {
    return `Proposal has ${ops.length} operations (max ${MAX_OPS_PER_TURN}). Please ask for a smaller change.`;
  }
  return null;
}
