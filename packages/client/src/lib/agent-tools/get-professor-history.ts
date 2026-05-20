import type { ToolContext, ToolResult } from './types';

export function getProfessorHistory(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  const dist = ctx.gradeDistributions[courseId];
  if (!dist || !dist.byInstructor || Object.keys(dist.byInstructor).length === 0) {
    return {
      content: {
        course_id: courseId,
        instructors: [],
        note: 'No per-instructor data available for this course',
      },
    };
  }

  const instructors = Object.entries(dist.byInstructor).map(([name, stats]) => ({
    instructor: name,
    avg_gpa: stats.avg_gpa,
    total_enrollment: stats.total_enrollment,
    grade_distribution: stats.distribution,
  }));

  // Sort by avg_gpa descending
  instructors.sort((a, b) => b.avg_gpa - a.avg_gpa);

  return {
    content: {
      course_id: courseId,
      course_title: dist.course_title,
      instructors,
    },
  };
}
