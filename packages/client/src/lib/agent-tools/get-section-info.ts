import type { ToolContext, ToolResult } from './types';

export function getSectionInfo(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const courseId = String(args.course_id ?? '').trim().toUpperCase();
  if (!courseId) {
    return { content: { error: 'course_id is required' }, isError: true };
  }

  if (!ctx.fallSections) {
    return {
      content: {
        course_id: courseId,
        sections: [],
        note: 'No section data loaded for the current term',
      },
    };
  }

  const data = ctx.fallSections.courses[courseId];
  if (!data) {
    return {
      content: {
        course_id: courseId,
        semester: ctx.fallSections.semester,
        sections: [],
        note: `No sections found for ${courseId} in ${ctx.fallSections.semester}`,
      },
    };
  }

  const sections = data.sections.map(s => ({
    unique: s.unique,
    instructor: s.instructor,
    status: s.status,
    instruction_mode: s.instruction_mode,
    meetings: s.meetings,
    core: s.core,
  }));

  return {
    content: {
      course_id: courseId,
      title: data.title,
      semester: ctx.fallSections.semester,
      section_count: sections.length,
      sections,
    },
  };
}
