import type {
  Plan,
  UserProfile,
  CourseCatalog,
  DegreeRequirements,
  TechCoreTrack,
  PrereqNode,
} from '../types';
import { getCourseCredits, buildTranscriptCredits } from './course-utils';
import { isTechCorePickOne } from '../types';
import { LEGACY_TO_CANONICAL } from './catalog-rename';

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
  mathBACompleted?: number;
  mathBATotal?: number;
}

/**
 * Math courses relevant for the Math BA double-major,
 * beyond what the BSECE already requires.
 */
const MATH_BA_ADDITIONAL = [
  'M 361K', // Real Analysis I (Math BA: real_analysis option)
  'M 365C', // Real Analysis I alternate
  'M 362K', // Probability I (Math BA: probability)
  'M 374M', // Numerical Analysis: Linear Algebra (Math BA: broadening)
  'M 378K', // Introduction to Mathematical Statistics (Math BA: broadening)
  'M 368K', // Numerical Methods for Applications (Math BA: broadening)
];

/**
 * Computes progress summary based on plan state, user profile, and requirements.
 */
export function computeProgress(
  plan: Plan,
  profile: UserProfile,
  catalog: CourseCatalog,
  prereqNodes: Record<string, PrereqNode>,
  degreeReqs: DegreeRequirements,
  techCore: TechCoreTrack,
  mathBAToggle: boolean = false
): ProgressSummary {
  // 1. Collect all unique courses from plan, profile (completed + in progress)
  const allPlacedOrCompleted = [
    ...(profile.completed_courses?.map((c) => c.course) || []),
    ...(profile.in_progress_courses?.map((c) => c.course) || []),
    ...Object.values(plan).flat(),
  ];
  const unique = [...new Set(allPlacedOrCompleted)].filter(Boolean) as string[];

  // Transcript credit_hours win over catalog (e.g. ECE 302 catalog=5 but Adi got it for 3).
  const transcriptCredits = buildTranscriptCredits(profile);

  // 2. Total Credit Hours
  const totalHours = unique.reduce((sum, courseId) => {
    return sum + getCourseCredits(courseId, catalog, prereqNodes, transcriptCredits);
  }, 0);

  // 3. ECE Core
  const eceCoreList = degreeReqs.ece_core.courses;
  const honorsToCore = Object.fromEntries(
    Object.entries(degreeReqs.ece_core.honors_variants).map(([core, honors]) => [honors, core])
  );
  
  // D6: use shared LEGACY_TO_CANONICAL for pre-2026 renumber mapping
  const legacyToCore = LEGACY_TO_CANONICAL;

  const completedEceCore = unique.filter((courseId) => {
    const normalizedId = honorsToCore[courseId] || legacyToCore[courseId] || courseId;
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

    // Include common CTI equivalents for VAPA and Humanities
    const enhancedOptions = [...options];
    if (slot.id === 'vapa') enhancedOptions.push('CTI 301G');
    if (slot.id === 'humanities') enhancedOptions.push('CTI 302');

    if (enhancedOptions.some((opt) => unique.includes(opt))) {
      completedGenEdSlots.add(slot.id);
    }
  });

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

  // 6. Math BA (What-If)
  let mathBACompleted = 0;
  let mathBATotal = 0;
  if (mathBAToggle) {
    mathBACompleted = MATH_BA_ADDITIONAL.filter(id => unique.includes(id)).length;
    mathBATotal = MATH_BA_ADDITIONAL.length;
  }

  // 7. Free Electives
  // Handoff: "Advanced ECE electives in plan"
  // Target: 11 hrs
  const eceCoreAllIds = new Set([
    ...eceCoreList,
    ...Object.keys(honorsToCore),
    ...Object.keys(legacyToCore),
  ]);
  
  const electiveHours = unique
    .filter((courseId) => {
      if (!courseId) return false;
      const prefix = courseId.split(' ')[0];
      const numStr = courseId.split(' ')[1];
      const num = parseInt(numStr);

      const isEce = prefix === 'ECE';
      const isAdvanced = num >= 320;

      const isEceCore = eceCoreAllIds.has(courseId);
      const isTechCore = techCoreUsed.has(courseId);

      return isEce && isAdvanced && !isEceCore && !isTechCore;
    })
    .reduce((sum, id) => sum + getCourseCredits(id, catalog, prereqNodes, transcriptCredits), 0);

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
    mathBACompleted,
    mathBATotal,
  };
}
