import type { ToolContext, ToolResult } from './types';
import { isTechCorePickOne } from '../../types';

export function listRemainingRequirements(ctx: ToolContext, _args: Record<string, unknown>): ToolResult {
  const allPlacedCourses = new Set<string>(
    Object.values(ctx.plan).flat()
  );

  const completedIds = new Set<string>(
    ctx.userProfile.completed_courses.map(c => c.course)
  );
  const inProgressIds = new Set<string>(
    ctx.userProfile.in_progress_courses.map(c => c.course)
  );

  const satisfied = new Set<string>([...allPlacedCourses, ...completedIds, ...inProgressIds]);

  // ECE core
  const eceCore = ctx.degreeRequirements.ece_core.courses;
  const missingEceCore = eceCore.filter(id => !satisfied.has(id));

  // Math sequence
  const mathReq = ctx.degreeRequirements.math_sequence.required;
  const missingMath = mathReq.filter(id => !satisfied.has(id));

  // Physics sequence
  const physReq = ctx.degreeRequirements.physics_sequence.required;
  const missingPhysics = physReq.filter(id => !satisfied.has(id));

  // Tech core
  const techCore = ctx.techCores[ctx.techCoreId];
  const missingTechCore: string[] = [];
  if (techCore) {
    const rc = techCore.required_courses;
    if (rc.advanced_math && !satisfied.has(rc.advanced_math.id)) {
      missingTechCore.push(rc.advanced_math.id);
    }
    if (rc.core) {
      for (const entry of rc.core) {
        if (isTechCorePickOne(entry)) {
          const anyDone = entry.options.some(o => satisfied.has(o.id));
          if (!anyDone) missingTechCore.push(`[one of: ${entry.options.map(o => o.id).join(', ')}]`);
        } else if (!satisfied.has(entry.id)) {
          missingTechCore.push(entry.id);
        }
      }
    }
  }

  return {
    content: {
      tech_core_id: ctx.techCoreId,
      missing_ece_core: missingEceCore,
      missing_math: missingMath,
      missing_physics: missingPhysics,
      missing_tech_core: missingTechCore,
      summary: {
        ece_core: `${eceCore.length - missingEceCore.length}/${eceCore.length} complete`,
        math: `${mathReq.length - missingMath.length}/${mathReq.length} complete`,
        physics: `${physReq.length - missingPhysics.length}/${physReq.length} complete`,
      },
    },
  };
}
