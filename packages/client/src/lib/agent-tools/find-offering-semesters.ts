import type { ToolContext, ToolResult } from './types';

export function findOfferingSemesters(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  const entry = ctx.offeringSchedule[courseId];
  if (!entry) {
    return {
      content: {
        course_id: courseId,
        offered_semesters: [],
        note: 'No offering schedule data found — course may be offered but is not in the schedule file',
      },
    };
  }

  return {
    content: {
      course_id: courseId,
      title: entry.title,
      offered_semesters: entry.offered_semesters,
      offerings_by_term: entry.offerings,
    },
  };
}
