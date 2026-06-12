import type { ToolContext, ToolResult } from './types';
import { getOfferedSeasons } from '../course-utils';

export function findOfferingSemesters(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  const seasons = getOfferedSeasons(courseId, ctx.offeringSchedule);
  if (seasons === null) {
    return {
      content: {
        course_id: courseId,
        offered_semesters: [],
        note: 'No offering data known for this course — it may be offered any season',
      },
    };
  }

  const entry = ctx.offeringSchedule[courseId];
  return {
    content: {
      course_id: courseId,
      title: entry.title,
      offered_semesters: seasons,
      offerings_by_term: entry.offerings,
    },
  };
}
