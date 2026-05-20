import type { ToolContext, ToolResult } from './types';

/**
 * Given a course ID, estimates how removing it from the plan would push
 * graduation back (how many downstream courses it blocks).
 */
export function calculateGraduationImpact(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  // BFS: find all courses transitively depending on this one
  const dependents = new Map<string, string[]>();
  for (const edge of ctx.prereqGraph.edges) {
    const list = dependents.get(edge.from) ?? [];
    list.push(edge.to);
    dependents.set(edge.from, list);
  }

  const blockedByThis = new Set<string>();
  const queue = [courseId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of dependents.get(current) ?? []) {
      if (!blockedByThis.has(dep)) {
        blockedByThis.add(dep);
        queue.push(dep);
      }
    }
  }

  // Of those, which are in the current plan?
  const allPlaced = new Set<string>(Object.values(ctx.plan).flat());
  const blockedInPlan = [...blockedByThis].filter(id => allPlaced.has(id));

  // Find the latest semester in the plan (estimate graduation delay)
  const semesterOrder = ctx.semesters.map(s => s.id);
  let latestBlockedIndex = -1;
  for (const id of blockedInPlan) {
    for (const [semId, courses] of Object.entries(ctx.plan)) {
      if (courses.includes(id)) {
        const idx = semesterOrder.indexOf(semId);
        if (idx > latestBlockedIndex) latestBlockedIndex = idx;
      }
    }
  }

  const courseInPlan = allPlaced.has(courseId);
  let placedIn: string | null = null;
  for (const [semId, courses] of Object.entries(ctx.plan)) {
    if (courses.includes(courseId)) { placedIn = semId; break; }
  }

  return {
    content: {
      course_id: courseId,
      is_in_current_plan: courseInPlan,
      placed_in_semester: placedIn,
      downstream_blocked_count: blockedByThis.size,
      blocked_in_plan: blockedInPlan,
      latest_blocked_semester: latestBlockedIndex >= 0 ? semesterOrder[latestBlockedIndex] : null,
      impact_summary: blockedByThis.size === 0
        ? `${courseId} has no downstream dependents — removing it does not affect other planned courses.`
        : `Removing ${courseId} would block ${blockedInPlan.length} already-planned course(s).`,
    },
  };
}
