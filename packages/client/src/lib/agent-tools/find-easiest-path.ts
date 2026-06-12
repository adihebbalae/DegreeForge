import type { ToolContext, ToolResult } from './types';
import { getCourseCredits } from '../course-utils';

/**
 * Given a target course, returns the shortest prerequisite chain leading to it,
 * with avg GPA for each course in the chain (as a proxy for difficulty).
 */
export function findEasiestPath(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  // Build prereq map: courseId -> direct prereqs
  const prereqsOf = new Map<string, string[]>();
  for (const edge of ctx.prereqGraph.edges) {
    if (edge.type !== 'prerequisite') continue;
    const list = prereqsOf.get(edge.to) ?? [];
    list.push(edge.from);
    prereqsOf.set(edge.to, list);
  }

  // BFS to find all ancestors (transitive prereqs)
  const allPrereqs: string[] = [];
  const visited = new Set<string>();
  const queue = [courseId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const prereq of prereqsOf.get(current) ?? []) {
      if (!visited.has(prereq)) {
        visited.add(prereq);
        allPrereqs.push(prereq);
        queue.push(prereq);
      }
    }
  }

  const satisfied = new Set<string>([
    ...ctx.userProfile.completed_courses.map(c => c.course),
    ...ctx.userProfile.in_progress_courses.map(c => c.course),
    ...Object.values(ctx.plan).flat(),
  ]);

  const remaining = allPrereqs.filter(id => !satisfied.has(id));

  const enriched = remaining.map(id => ({
    id,
    title: ctx.prereqGraph.nodes[id]?.title ?? ctx.catalog[id]?.title ?? id,
    avg_gpa: ctx.gradeDistributions[id]?.avg_gpa ?? null,
    credits: getCourseCredits(id, ctx.catalog),
  }));

  // Sort by avg_gpa descending (higher GPA = "easier") to suggest easiest-first
  enriched.sort((a, b) => {
    if (a.avg_gpa === null) return 1;
    if (b.avg_gpa === null) return -1;
    return b.avg_gpa - a.avg_gpa;
  });

  return {
    content: {
      course_id: courseId,
      title: ctx.prereqGraph.nodes[courseId]?.title ?? ctx.catalog[courseId]?.title ?? courseId,
      total_prereqs: allPrereqs.length,
      already_satisfied: allPrereqs.length - remaining.length,
      remaining_prereqs: enriched,
      note: 'Courses are sorted by average GPA (highest first) as a proxy for ease of completion.',
    },
  };
}
