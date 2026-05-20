import type { ToolContext, ToolResult } from './types';

export function getGradeDistribution(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  const dist = ctx.gradeDistributions[courseId];
  if (!dist) {
    return {
      content: { error: `No grade distribution data found for "${courseId}"` },
      isError: true,
    };
  }

  return {
    content: {
      course_id: courseId,
      avg_gpa: dist.avg_gpa,
      a_pct: dist.a_pct,
      b_pct: dist.b_pct,
      c_pct: dist.c_pct,
      d_pct: dist.d_pct,
      f_pct: dist.f_pct,
      total_enrollment: dist.total_enrollment,
      total_sections: dist.total_sections,
      by_instructor: dist.byInstructor ?? {},
    },
  };
}
