import type { ToolContext, ToolResult } from './types';

export function getCreditProgress(ctx: ToolContext, _args: Record<string, unknown>): ToolResult {
  const profile = ctx.userProfile;
  const totalRequired = ctx.degreeRequirements.total_credit_hours;

  // Sum credits from completed courses
  const completedHours = profile.completed_courses.reduce(
    (sum, c) => sum + (c.credit_hours ?? 3),
    0
  );

  // Sum credits from in-progress courses
  const inProgressHours = profile.in_progress_courses.reduce(
    (sum, c) => sum + (c.credit_hours ?? 3),
    0
  );

  // Sum credits from future planned courses
  const futureSemesters = ctx.semesters.filter(s => s.status === 'future');
  let plannedFutureHours = 0;
  for (const sem of futureSemesters) {
    for (const courseId of ctx.plan[sem.id] ?? []) {
      const credits =
        ctx.catalog[courseId]?.credits ??
        ctx.prereqGraph.nodes[courseId]?.credits ??
        3;
      plannedFutureHours += credits;
    }
  }

  const earnedAndInProgress = completedHours + inProgressHours;
  const totalProjected = earnedAndInProgress + plannedFutureHours;
  const remaining = Math.max(0, totalRequired - earnedAndInProgress);

  return {
    content: {
      total_required: totalRequired,
      completed_hours: completedHours,
      in_progress_hours: inProgressHours,
      planned_future_hours: plannedFutureHours,
      total_projected: totalProjected,
      remaining_to_graduate: remaining,
      on_track: totalProjected >= totalRequired,
      percent_complete: Math.round((earnedAndInProgress / totalRequired) * 100),
    },
  };
}
