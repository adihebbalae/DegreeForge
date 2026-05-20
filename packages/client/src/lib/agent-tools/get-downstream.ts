import type { ToolContext, ToolResult } from './types';

/** BFS over the prereq graph to find all transitively dependent courses. */
function getDownstream(courseId: string, edges: { from: string; to: string; type: string }[]): string[] {
  const dependents = new Map<string, string[]>();
  for (const edge of edges) {
    const list = dependents.get(edge.from) ?? [];
    list.push(edge.to);
    dependents.set(edge.from, list);
  }

  const visited = new Set<string>();
  const queue = [courseId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of dependents.get(current) ?? []) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }
  return Array.from(visited);
}

export function getDownstreamTool(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  const downstream = getDownstream(courseId, ctx.prereqGraph.edges);
  const enriched = downstream.map(id => ({
    id,
    title: ctx.prereqGraph.nodes[id]?.title ?? ctx.catalog[id]?.title ?? id,
  }));

  return {
    content: {
      course_id: courseId,
      downstream_courses: enriched,
      count: enriched.length,
    },
  };
}
