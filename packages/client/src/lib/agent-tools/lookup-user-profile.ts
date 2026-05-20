import type { ToolContext, ToolResult } from './types';

export function lookupUserProfile(ctx: ToolContext, _args: Record<string, unknown>): ToolResult {
  const profile = ctx.userProfile;

  return {
    content: {
      name: profile.name,
      eid: profile.eid,
      classification: profile.classification,
      graduation_target: profile.graduation_target,
      tech_core: {
        declared: profile.tech_core.declared,
        status: profile.tech_core.status,
      },
      gpa: {
        cumulative: profile.gpa.cumulative,
        gpa_hours: profile.gpa.gpa_hours,
      },
      credit_summary: profile.credit_summary,
      preferences: profile.preferences,
      career_interests: profile.career_interests,
      completed_count: profile.completed_courses.length,
      in_progress_count: profile.in_progress_courses.length,
    },
  };
}
