import type { ToolContext, ToolResult } from './types';

export function getCourseInfo(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  const catalogEntry = ctx.catalog[courseId];
  const graphNode = ctx.prereqGraph.nodes[courseId];
  const gradeDist = ctx.gradeDistributions[courseId];

  if (!catalogEntry && !graphNode) {
    return { content: { error: `Course "${courseId}" not found in catalog or prereq graph` }, isError: true };
  }

  return {
    content: {
      id: courseId,
      title: catalogEntry?.title ?? graphNode?.title ?? 'Unknown',
      credits: catalogEntry?.credits ?? graphNode?.credits ?? 3,
      description: catalogEntry?.description ?? '',
      prerequisites: catalogEntry?.prerequisites ?? [],
      corequisites: catalogEntry?.corequisites ?? [],
      category: graphNode?.category ?? '',
      offered_semesters: graphNode?.offered ?? [],
      avg_gpa: gradeDist?.avg_gpa ?? null,
      total_enrollment: gradeDist?.total_enrollment ?? null,
    },
  };
}
