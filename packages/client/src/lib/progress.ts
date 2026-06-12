import type {
  Plan,
  UserProfile,
  CourseCatalog,
  DegreeRequirements,
  TechCoreTrack,
} from '../types';
import { getCourseCredits, buildTranscriptCredits } from './course-utils';
import { parseCourseId } from './sanitize-course-list';
import { isTechCorePickOne } from '../types';
import { getEquivalenceRegistry, satisfiesRequirement, expandSatisfied } from './equivalence';

/**
 * Minimum course number that counts as an "advanced" ECE elective toward the free
 * elective bar. ECE 320+ are upper-division; anything below is lower-division and
 * does not count here.
 */
const ADVANCED_ELECTIVE_MIN_NUMBER = 320;

/**
 * Gen-ed slot target (denominator of the gen-ed progress bar). The degree JSON
 * authors 9 core_curriculum slots (ugs, rhe, humanities, vapa, his1, his2, gov1,
 * gov2, sbs) but the shipped bar tracks a target of 8, so the numerator (which can
 * reach 9) is clamped to this value. Kept as a named constant rather than derived
 * from slots.length to preserve the shipped /8 denominator — the 8-vs-9 mismatch is
 * a domain/requirements question deferred to Brief 2, not changed here.
 */
const GEN_ED_SLOT_TARGET = 8;

/** Tech-core target: 8 upper-division courses in a declared track (ECB dual = 7). */
const TECH_CORE_TARGET = 8;

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
  const uniqueSet = new Set(unique);

  // E3: requirement matching goes through THE equivalence registry — the same
  // membership the solver and prereq checks use (honors / legacy renumber /
  // cross-dept / transfer), so the bars can never disagree with them.
  const registry = getEquivalenceRegistry(degreeReqs);

  // Transcript credit_hours win over catalog (e.g. ECE 302 catalog=5 but Adi got it for 3).
  const transcriptCredits = buildTranscriptCredits(profile);

  // 2. Total Credit Hours
  const totalHours = unique.reduce((sum, courseId) => {
    return sum + getCourseCredits(courseId, catalog, transcriptCredits);
  }, 0);

  // 3. ECE Core — count SLOTS satisfied (a slot is done when any equivalent
  // form of its course is taken; taking two forms can no longer double-count).
  const eceCoreList = degreeReqs.ece_core.courses;
  const eceCoreCompleted = eceCoreList.filter((core) =>
    satisfiesRequirement(core, uniqueSet, registry)
  ).length;
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

    if (enhancedOptions.some((opt) => satisfiesRequirement(opt, uniqueSet, registry))) {
      completedGenEdSlots.add(slot.id);
    }
  });

  // Numerator can reach the authored 9 slots; clamp to the tracked target of 8.
  const genEdTotal = GEN_ED_SLOT_TARGET;
  const genEdCompleted = Math.min(completedGenEdSlots.size, genEdTotal);

  // 5. Tech Core
  // Count required slots + electives from pool. A matched requirement marks
  // its whole equivalence class as used so a taken variant is never
  // double-counted as a free elective below.
  const techCoreUsed = new Set<string>();
  const markUsed = (id: string) => {
    for (const v of expandSatisfied(id, registry)) techCoreUsed.add(v);
  };
  let techCoreCompletedCount = 0;

  const req = techCore.required_courses;

  // Advanced Math
  if (req.advanced_math && satisfiesRequirement(req.advanced_math.id, uniqueSet, registry)) {
    techCoreCompletedCount++;
    markUsed(req.advanced_math.id);
  }

  // Core courses
  req.core?.forEach((entry) => {
    if (isTechCorePickOne(entry)) {
      const match = entry.options.find((opt) => satisfiesRequirement(opt.id, uniqueSet, registry));
      if (match) {
        techCoreCompletedCount++;
        markUsed(match.id);
      }
    } else {
      if (satisfiesRequirement(entry.id, uniqueSet, registry)) {
        techCoreCompletedCount++;
        markUsed(entry.id);
      }
    }
  });

  // Core Lab
  if (req.core_lab) {
    if (isTechCorePickOne(req.core_lab)) {
      const match = req.core_lab.options.find((opt) => satisfiesRequirement(opt.id, uniqueSet, registry));
      if (match) {
        techCoreCompletedCount++;
        markUsed(match.id);
      }
    } else {
      if (satisfiesRequirement(req.core_lab.id, uniqueSet, registry)) {
        techCoreCompletedCount++;
        markUsed(req.core_lab.id);
      }
    }
  }

  // Required Elective
  if (req.required_elective && satisfiesRequirement(req.required_elective.id, uniqueSet, registry)) {
    techCoreCompletedCount++;
    markUsed(req.required_elective.id);
  }

  // Electives from pool (count remaining needed to reach the tech-core target)
  const remainingNeeded = TECH_CORE_TARGET - techCoreCompletedCount;
  if (remainingNeeded > 0) {
    const electivesFromPool = techCore.elective_pool.filter(
      (courseId) => satisfiesRequirement(courseId, uniqueSet, registry) && !techCoreUsed.has(courseId)
    );
    techCoreCompletedCount += Math.min(electivesFromPool.length, remainingNeeded);
    // Mark them as used
    electivesFromPool.slice(0, remainingNeeded).forEach(markUsed);
  }

  const techCoreTotal = TECH_CORE_TARGET;

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
  // Every form of every core course is excluded (honors/legacy/cross-dept).
  const eceCoreAllIds = new Set<string>();
  for (const core of eceCoreList) {
    for (const v of expandSatisfied(core, registry)) eceCoreAllIds.add(v);
  }

  const electiveHours = unique
    .filter((courseId) => {
      // Single course-identity parser; null covers non-string / unparseable tokens.
      const parsed = parseCourseId(courseId);
      if (!parsed) return false;

      const isEce = parsed.prefix === 'ECE';
      const isAdvanced = parsed.number >= ADVANCED_ELECTIVE_MIN_NUMBER;

      const isEceCore = eceCoreAllIds.has(courseId);
      const isTechCore = techCoreUsed.has(courseId);

      return isEce && isAdvanced && !isEceCore && !isTechCore;
    })
    .reduce((sum, id) => sum + getCourseCredits(id, catalog, transcriptCredits), 0);

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
