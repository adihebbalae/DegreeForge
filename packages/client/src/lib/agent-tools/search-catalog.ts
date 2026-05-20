import type { ToolContext, ToolResult } from './types';

export function searchCatalog(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const query = String(args.query ?? '').trim().toLowerCase();
  if (!query) {
    return { content: { error: 'query is required' }, isError: true };
  }

  const maxResults = typeof args.max_results === 'number' ? Math.min(args.max_results, 50) : 20;
  const departmentFilter = args.department ? String(args.department).trim().toUpperCase() : null;

  const results: Array<{
    id: string;
    title: string;
    credits: number;
    description: string;
    avg_gpa: number | null;
  }> = [];

  for (const [id, course] of Object.entries(ctx.catalog)) {
    if (departmentFilter && !id.startsWith(departmentFilter)) continue;

    const titleLower = course.title.toLowerCase();
    const descLower = course.description.toLowerCase();
    const idLower = id.toLowerCase();

    if (
      idLower.includes(query) ||
      titleLower.includes(query) ||
      descLower.includes(query)
    ) {
      results.push({
        id,
        title: course.title,
        credits: course.credits,
        description: course.description.slice(0, 200),
        avg_gpa: ctx.gradeDistributions[id]?.avg_gpa ?? null,
      });

      if (results.length >= maxResults) break;
    }
  }

  return {
    content: {
      query,
      result_count: results.length,
      results,
    },
  };
}
