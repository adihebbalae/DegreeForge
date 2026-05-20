import type { ToolContext, ToolResult } from './types';

export function getPrereqs(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  const edges = ctx.prereqGraph.edges.filter(
    e => e.to === courseId && e.type === 'prerequisite'
  );
  const coreqEdges = ctx.prereqGraph.edges.filter(
    e => e.to === courseId && e.type === 'corequisite'
  );

  const enrichEdge = (courseId: string) => ({
    id: courseId,
    title: ctx.prereqGraph.nodes[courseId]?.title ?? ctx.catalog[courseId]?.title ?? courseId,
  });

  return {
    content: {
      course_id: courseId,
      prerequisites: edges.map(e => ({ ...enrichEdge(e.from), min_grade: e.min_grade })),
      corequisites: coreqEdges.map(e => enrichEdge(e.from)),
    },
  };
}
