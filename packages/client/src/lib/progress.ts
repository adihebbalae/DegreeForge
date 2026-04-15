import type { 
  Plan, 
  UserProfile, 
  CourseCatalog, 
  DegreeRequirements, 
  TechCoreTrack, 
  PrereqNode,
} from '../types';
import { getCourseCredits } from './course-utils';
import { isTechCorePickOne } from '../types';

export interface ProgressSummary {
  totalHours: number;
  totalHoursTarget: number;
  eceCoreCompleted: number;
  eceCoreTotal: number;
  genEdCompleted: number;
  genEdTotal: number;
  techCoreCompleted: number;
  techCoreTotal: number;
  electiveHours: number;
  electiveTotalHours: number;
}

/**
 * Computes progress summary based on plan state, user profile, and requirements.
 */
export function computeProgress(
  plan: Plan,
  profile: UserProfile,
  catalog: CourseCatalog,
  prereqNodes: Record<string, PrereqNode>,
  degreeReqs: DegreeRequirements,
  techCore: TechCoreTrack
): ProgressSummary {
  // 1. Collect all unique courses from plan, profile (completed + in progress)
  const allPlacedOrCompleted = [
    ...(profile.completed_courses?.map((c) => c.course) || []),
    ...(profile.in_progress_courses?.map((c) => c.course) || []),
    ...Object.values(plan).flat(),
  ];
  const unique = [...new Set(allPlacedOrCompleted)];

  // 2. Total Credit Hours
  const totalHours = unique.reduce((sum, courseId) => {
    return sum + getCourseCredits(courseId, catalog, prereqNodes);
  }, 0);

  // 3. ECE Core
  const eceCoreList = degreeReqs.ece_core.courses;
  const honorsToCore = Object.fromEntries(
    Object.entries(degreeReqs.ece_core.honors_variants).map(([core, honors]) => [honors, core])
  );

  const completedEceCore = unique.filter((courseId) => {
    const normalizedId = honorsToCore[courseId] || courseId;
    return eceCoreList.includes(normalizedId);
  });
  const eceCoreCompleted = completedEceCore.length;
  const eceCoreTotal = eceCoreList.length;

  // 4. Core Curriculum (Gen Ed)
  // Maps slots to completion
  const completedGenEdSlots = new Set<string>();
  const genEdSlots = degreeReqs.core_curriculum.slots;

  genEdSlots.forEach((slot) => {
    let options = slot.options;
    if (options.includes('same_as_his1')) {
      const his1Slot = genEdSlots.find((s) => s.id === 'his1');
      if (his1Slot) options = his1Slot.options;
    }

    if (options.some((opt) => unique.includes(opt))) {
      completedGenEdSlots.add(slot.id);
    }
  });

  // Special case: CTI courses often count for core too.
  // Profile has CTI 301G and CTI 302.
  // We'll count them toward Gen Ed if they are not explicitly in slots but are 'gen_ed' category
  // Actually, let's stick to the slots for now.
  
  const genEdTotal = 8;
  const genEdCompleted = Math.min(completedGenEdSlots.size, genEdTotal);

  // 5. Tech Core
  // Count required slots + electives from pool
  let techCoreUsed = new Set<string>();
  let techCoreCompletedCount = 0;

  const req = techCore.required_courses;

  // Advanced Math
  if (req.advanced_math && unique.includes(req.advanced_math.id)) {
    techCoreCompletedCount++;
    techCoreUsed.add(req.advanced_math.id);
  }

  // Core courses
  req.core?.forEach((entry) => {
    if (isTechCorePickOne(entry)) {
      const match = entry.options.find((opt) => unique.includes(opt.id));
      if (match) {
        techCoreCompletedCount++;
        techCoreUsed.add(match.id);
      }
    } else {
      if (unique.includes(entry.id)) {
        techCoreCompletedCount++;
        techCoreUsed.add(entry.id);
      }
    }
  });

  // Core Lab
  if (req.core_lab) {
    if (isTechCorePickOne(req.core_lab)) {
      const match = req.core_lab.options.find((opt) => unique.includes(opt.id));
      if (match) {
        techCoreCompletedCount++;
        techCoreUsed.add(match.id);
      }
    } else {
      if (unique.includes(req.core_lab.id)) {
        techCoreCompletedCount++;
        techCoreUsed.add(req.core_lab.id);
      }
    }
  }

  // Required Elective
  if (req.required_elective && unique.includes(req.required_elective.id)) {
    techCoreCompletedCount++;
    techCoreUsed.add(req.required_elective.id);
  }

  // Electives from pool (count remaining needed to reach target 8)
  const remainingNeeded = 8 - techCoreCompletedCount;
  if (remainingNeeded > 0) {
    const electivesFromPool = techCore.elective_pool.filter(
      (courseId) => unique.includes(courseId) && !techCoreUsed.has(courseId)
    );
    techCoreCompletedCount += Math.min(electivesFromPool.length, remainingNeeded);
    // Mark them as used
    electivesFromPool.slice(0, remainingNeeded).forEach(id => techCoreUsed.add(id));
  }

  const techCoreTotal = 8;

  // 6. Free Electives
  // Handoff: "Advanced ECE electives in plan"
  // Target: 11 hrs
  const eceCoreNormalized = new Set(completedEceCore.map(id => honorsToCore[id] || id));
  
  const electiveHours = unique
    .filter((courseId) => {
      const prefix = courseId.split(' ')[0];
      const numStr = courseId.split(' ')[1];
      const num = parseInt(numStr);
      
      const isEce = prefix === 'ECE';
      const isAdvanced = num >= 320;
      
      const isEceCore = eceCoreNormalized.has(courseId) || honorsToCore[courseId] !== undefined;
      const isTechCore = techCoreUsed.has(courseId);

      return isEce && isAdvanced && !isEceCore && !isTechCore;
    })
    .reduce((sum, id) => sum + getCourseCredits(id, catalog, prereqNodes), 0);

  return {
    totalHours,
    totalHoursTarget: 128,
    eceCoreCompleted,
    eceCoreTotal,
    genEdCompleted,
    genEdTotal,
    techCoreCompleted: Math.min(techCoreCompletedCount, techCoreTotal),
    techCoreTotal,
    electiveHours,
    electiveTotalHours: 11,
  };
}
