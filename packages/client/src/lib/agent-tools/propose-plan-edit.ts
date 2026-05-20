import type { ToolContext, ToolResult, PlanEditOperation, ProposedPlanEdit } from './types';

export function proposePlanEdit(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const operations = args.operations as PlanEditOperation[] | undefined;
  const reasoning = String(args.reasoning ?? '').trim();

  if (!operations || !Array.isArray(operations) || operations.length === 0) {
    return { content: { error: 'operations array is required and must be non-empty' }, isError: true };
  }

  if (!reasoning) {
    return { content: { error: 'reasoning is required' }, isError: true };
  }

  // Validate each operation has required fields
  for (const op of operations) {
    if (!op.op || !['add', 'remove', 'move'].includes(op.op)) {
      return { content: { error: `Invalid op type: "${op.op}". Must be 'add', 'remove', or 'move'.` }, isError: true };
    }
    if (!op.courseId) {
      return { content: { error: 'Each operation requires courseId' }, isError: true };
    }
    if ((op.op === 'add' || op.op === 'remove') && !op.semesterId) {
      return { content: { error: `Operation ${op.op} requires semesterId` }, isError: true };
    }
    if (op.op === 'move' && (!op.fromSemesterId || !op.toSemesterId)) {
      return { content: { error: 'Move operation requires fromSemesterId and toSemesterId' }, isError: true };
    }
  }

  const proposal: ProposedPlanEdit = { operations, reasoning };

  return {
    content: {
      type: 'plan_edit_proposal',
      proposal,
      message: 'Plan edit proposal ready for user review. The user must accept or reject each change.',
    },
  };
}
