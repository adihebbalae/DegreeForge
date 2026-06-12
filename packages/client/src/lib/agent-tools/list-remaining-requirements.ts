import type { ToolContext, ToolResult } from './types';
import { isTechCorePickOne } from '../../types';
import { isRequirementSatisfied } from '../requirements';

export function listRemainingRequirements(ctx: ToolContext, _args: Record<string, unknown>): ToolResult {
  // F: the shared variant-expanded read model — honors/legacy/cross-dept and
  // transfer forms count, matching the Progress panel and the solver.
  const satisfied = ctx.satisfiedSet;
  const done = (id: string) => isRequirementSatisfied(id, satisfied);

  // ECE core
  const eceCore = ctx.degreeRequirements.ece_core.courses;
  const missingEceCore = eceCore.filter(id => !done(id));

  // Math sequence
  const mathReq = ctx.degreeRequirements.math_sequence.required;
  const missingMath = mathReq.filter(id => !done(id));

  // Physics sequence
  const physReq = ctx.degreeRequirements.physics_sequence.required;
  const missingPhysics = physReq.filter(id => !done(id));

  // Tech core
  const techCore = ctx.techCores[ctx.techCoreId];
  const missingTechCore: string[] = [];
  if (techCore) {
    const rc = techCore.required_courses;
    if (rc.advanced_math && !done(rc.advanced_math.id)) {
      missingTechCore.push(rc.advanced_math.id);
    }
    if (rc.core) {
      for (const entry of rc.core) {
        if (isTechCorePickOne(entry)) {
          const anyDone = entry.options.some(o => done(o.id));
          if (!anyDone) missingTechCore.push(`[one of: ${entry.options.map(o => o.id).join(', ')}]`);
        } else if (!done(entry.id)) {
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
