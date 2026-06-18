import type {
  Plan,
  UserProfile,
  CourseCatalog,
  DegreeRequirements,
  TechCoreTrack,
  BucketView,
  CoreCategory,
} from '../types';
import { getCourseCredits, buildTranscriptCredits } from './course-utils';
import { parseCourseId } from './sanitize-course-list';
import { isTechCorePickOne } from '../types';
import { getEquivalenceRegistry, satisfiesRequirement, expandSatisfied } from './equivalence';

/**
 * Gen-ed slot id → UT core-curriculum flag that satisfies it. A planned/
 * completed course whose catalog `core` array contains the mapped category
 * satisfies the slot, in addition to the slot's explicit `options` list.
 *
 * Deliberately omitted: `rhe` (no UT core flag — RHE 306 is named directly) and
 * `humanities` (the UT "Humanities" flag is broad and the BSECE humanities slot
 * is the specific E 316L/M/N/P set + CTI 302; keeping it option-driven avoids
 * over-satisfying it with unrelated humanities-flagged courses).
 *
 * his1/his2 both map to 'his' and gov1/gov2 both map to 'gov'; the allocator
 * below assigns each taken course to at most one slot so a single flagged
 * course cannot satisfy both halves of a two-slot requirement.
 */
const SLOT_CORE_CATEGORY: Readonly<Record<string, CoreCategory>> = {
  ugs: 'ugs',
  vapa: 'vapa',
  his1: 'his',
  his2: 'his',
  gov1: 'gov',
  gov2: 'gov',
  sbs: 'sbs',
};

/**
 * Compute which gen-ed slots are satisfied, allocating each taken course to at
 * most ONE slot so two-slot requirements (his1/his2, gov1/gov2) can never be
 * double-counted by a single flagged course.
 *
 * A taken course satisfies a slot when it matches the slot's explicit `options`
 * (via the equivalence registry, plus the CTI 301G/302 special-cases) OR its
 * catalog `core` flag matches the slot's mapped CoreCategory. Explicit-option
 * matches are allocated first (they are the canonical, named courses); core-flag
 * matches fill the remaining slots from the still-unconsumed taken courses.
 *
 * Both passes are consume-aware: a slot only completes when an *as-yet-unconsumed*
 * taken course actually satisfies it, and that exact course is consumed in the
 * same step. The core-flag pass allocates deterministically and independent of
 * plan order by claiming single-purpose courses (eligible for the fewest open
 * slots) before multi-flag courses, so a multi-flag course can never strand a
 * slot that a single-flag course could have covered (e.g. WGS 301, the only
 * catalog course carrying 3 allocatable flags).
 */
function computeGenEdSlots(
  slots: DegreeRequirements['core_curriculum']['slots'],
  takenCourses: readonly string[],
  uniqueSet: ReadonlySet<string>,
  catalog: CourseCatalog,
  registry: ReturnType<typeof getEquivalenceRegistry>
): Set<string> {
  const completed = new Set<string>();
  const consumed = new Set<string>();

  const resolveOptions = (slot: (typeof slots)[number]): string[] => {
    let options = slot.options;
    if (options.includes('same_as_his1')) {
      const his1 = slots.find((s) => s.id === 'his1');
      if (his1) options = his1.options;
    }
    const enhanced = [...options];
    if (slot.id === 'vapa') enhanced.push('CTI 301G');
    if (slot.id === 'humanities') enhanced.push('CTI 302');
    return enhanced;
  };

  // Pass 1: explicit options. A slot only completes when an as-yet-UNCONSUMED
  // taken course satisfies one of its options; finding it and consuming it is a
  // single step. This is what stops a single HIS 315K from satisfying both his1
  // and his2 (his2 resolves to his1's option list via same_as_his1): once his1
  // consumes HIS 315K, his2 finds no unconsumed match and stays incomplete.
  for (const slot of slots) {
    const options = resolveOptions(slot);
    for (const opt of options) {
      if (opt === 'list_of_approved') continue;
      // Find a still-available taken course that satisfies this option.
      const match = takenCourses.find(
        (taken) =>
          !consumed.has(taken) && satisfiesRequirement(opt, new Set([taken]), registry)
      );
      if (match) {
        completed.add(slot.id);
        consumed.add(match);
        break;
      }
    }
  }

  // Pass 2: core-flag fallback for still-unsatisfied slots, drawing from the
  // taken courses not already consumed (one course per slot). Allocation is
  // deterministic and order-independent: process candidate courses in ascending
  // order of how many open core-flag slots they're eligible for (single-purpose
  // courses first), so a multi-flag course never greedily claims a slot a
  // single-flag course needed. Ties break on course id for stability.
  const openFlagSlots = slots.filter(
    (slot) => !completed.has(slot.id) && SLOT_CORE_CATEGORY[slot.id]
  );

  const eligibleSlotsOf = (taken: string): string[] =>
    openFlagSlots
      .filter((slot) => catalog[taken]?.core?.includes(SLOT_CORE_CATEGORY[slot.id]))
      .map((slot) => slot.id);

  const candidates = [...new Set(takenCourses)]
    .filter((taken) => !consumed.has(taken) && eligibleSlotsOf(taken).length > 0)
    .map((taken) => ({ taken, eligible: eligibleSlotsOf(taken) }))
    .sort((a, b) => a.eligible.length - b.eligible.length || a.taken.localeCompare(b.taken));

  for (const { taken } of candidates) {
    if (consumed.has(taken)) continue;
    // Re-evaluate against the still-open slots (an earlier candidate may have
    // filled one). Claim the first open eligible slot in declaration order.
    const slotId = openFlagSlots.find(
      (slot) =>
        !completed.has(slot.id) && catalog[taken]?.core?.includes(SLOT_CORE_CATEGORY[slot.id])
    )?.id;
    if (slotId) {
      completed.add(slotId);
      consumed.add(taken);
    }
  }

  return completed;
}

/**
 * Minimum course number that counts as an "advanced" ECE elective toward the free
 * elective bar. ECE 320+ are upper-division; anything below is lower-division and
 * does not count here.
 */
const ADVANCED_ELECTIVE_MIN_NUMBER = 320;

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
  // Physics bucket (split out from totals)
  physicsCompleted: number;
  physicsTotal: number;
  // Math hours (separate from tech-core math)
  mathHoursCompleted: number;
  mathHoursTotal: number;
  // Gen-ed slot detail
  completedGenEdSlots: ReadonlySet<string>;
  // Per-bucket view-models (FR-4)
  buckets: BucketView[];
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
  // Each slot is satisfied by its explicit options OR a catalog core flag; the
  // allocator assigns each taken course to at most one slot (no double-count).
  const genEdSlots = degreeReqs.core_curriculum.slots;
  const completedGenEdSlots = computeGenEdSlots(
    genEdSlots,
    unique,
    uniqueSet,
    catalog,
    registry
  );

  // Denominator is the number of slots authored in the JSON — data-driven.
  const genEdTotal = degreeReqs.core_curriculum.slots.length;
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

  // Required Elective (may be a single course or a pick-one group)
  if (req.required_elective) {
    if (isTechCorePickOne(req.required_elective)) {
      const match = req.required_elective.options.find((opt) =>
        satisfiesRequirement(opt.id, uniqueSet, registry)
      );
      if (match) {
        techCoreCompletedCount++;
        markUsed(match.id);
      }
    } else if (satisfiesRequirement(req.required_elective.id, uniqueSet, registry)) {
      techCoreCompletedCount++;
      markUsed(req.required_elective.id);
    }
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

  // 8. Physics bucket — separate from other counts
  const physicsRequired = degreeReqs.physics_sequence.required;
  const physicsHoursTotal = physicsRequired.reduce(
    (sum, id) => sum + getCourseCredits(id, catalog, transcriptCredits),
    0
  );
  const physicsHoursCompleted = physicsRequired
    .filter((id) => satisfiesRequirement(id, uniqueSet, registry))
    .reduce((sum, id) => sum + getCourseCredits(id, catalog, transcriptCredits), 0);

  // 9. Math sequence hours
  const mathRequired = degreeReqs.math_sequence.required;
  const mathHoursTotal = mathRequired.reduce(
    (sum, id) => sum + getCourseCredits(id, catalog, transcriptCredits),
    0
  );
  const mathHoursCompleted = mathRequired
    .filter((id) => satisfiesRequirement(id, uniqueSet, registry))
    .reduce((sum, id) => sum + getCourseCredits(id, catalog, transcriptCredits), 0);

  const summary: Omit<ProgressSummary, 'buckets'> = {
    totalHours,
    totalHoursTarget: degreeReqs.total_credit_hours,
    eceCoreCompleted,
    eceCoreTotal,
    genEdCompleted,
    genEdTotal,
    techCoreCompleted: Math.min(techCoreCompletedCount, techCoreTotal),
    techCoreTotal,
    electiveHours,
    electiveTotalHours: degreeReqs.free_electives.total_hours,
    mathBACompleted,
    mathBATotal,
    physicsCompleted: physicsHoursCompleted,
    physicsTotal: physicsHoursTotal,
    mathHoursCompleted,
    mathHoursTotal,
    completedGenEdSlots,
  };

  const buckets = buildBucketViews(
    summary,
    degreeReqs,
    techCore,
    uniqueSet,
    registry,
    catalog,
    transcriptCredits,
    techCoreUsed,
    eceCoreAllIds
  );

  // totalHoursTarget is the authoritative degree size from the catalog
  // (total_credit_hours = 125). The 6 bucket totals sum to 123 for all tracks
  // because the unbucketed advanced_tech_elective (3-4 h) is in no bucket — a
  // 2 h gap is intentional and accepted until a dedicated bucket is added.
  //
  // Keeping totalHoursTarget = 125 (not bucketSum) means:
  //   • headline "X / 125 hrs" can never show numerator > denominator for a
  //     normal student (completed+planned ≤ 125).
  //   • DegreeRadial outer spokes cover ~98 % of the circle (123/125); the small
  //     uncovered arc is visible as a minor gap — not a NaN/overflow.
  //   • The Claude chat tool get-credit-progress also uses total_credit_hours,
  //     so both surfaces agree.
  return {
    ...summary,
    buckets,
  };
}

// ─── BucketView builder ────────────────────────────────────────────────────────

/**
 * Build the per-bucket view-model array from a computed ProgressSummary.
 * This is THE single place where `ProgressSummary → BucketView[]` is defined,
 * so every surface (bars, radial, cards) renders identical buckets.
 *
 * The `remaining[]` entries are the unsatisfied requirements per bucket.
 * Pick-one / "any of N" slots that are unsatisfied are encoded as a note entry
 * rather than a single courseId (there is no canonical single course to suggest).
 * Free electives and the advanced-ECE gap use note entries because there is no
 * single required course ID.
 */
export function buildBucketViews(
  summary: Omit<ProgressSummary, 'buckets'>,
  degreeReqs: DegreeRequirements,
  techCore: TechCoreTrack,
  uniqueSet: ReadonlySet<string>,
  registry: ReturnType<typeof getEquivalenceRegistry>,
  catalog: CourseCatalog,
  transcriptCredits: Record<string, number>,
  techCoreUsed: ReadonlySet<string>,
  eceCoreAllIds: ReadonlySet<string>
): BucketView[] {
  // ── ECE Core ──────────────────────────────────────────────────────────────
  const eceCoreRemaining: BucketView['remaining'] = [];
  const eceCoreHoursCompleted = degreeReqs.ece_core.courses
    .filter((id) => satisfiesRequirement(id, uniqueSet, registry))
    .reduce((sum, id) => sum + getCourseCredits(id, catalog, transcriptCredits), 0);
  const eceCoreHoursTotal = degreeReqs.ece_core.courses.reduce(
    (sum, id) => sum + getCourseCredits(id, catalog, transcriptCredits),
    0
  );

  for (const courseId of degreeReqs.ece_core.courses) {
    if (!satisfiesRequirement(courseId, uniqueSet, registry)) {
      eceCoreRemaining.push({ courseId });
    }
  }

  const eceCoreBucket: BucketView = {
    id: 'ece_core',
    label: 'ECE Core',
    category: 'ece_core',
    doneHours: eceCoreHoursCompleted,
    totalHours: eceCoreHoursTotal,
    unit: 'hrs',
    complete: summary.eceCoreCompleted >= summary.eceCoreTotal,
    doneCount: summary.eceCoreCompleted,
    totalCount: summary.eceCoreTotal,
    countNoun: 'courses',
    remaining: eceCoreRemaining,
  };

  // ── Math ──────────────────────────────────────────────────────────────────
  const mathRemaining: BucketView['remaining'] = [];
  for (const courseId of degreeReqs.math_sequence.required) {
    if (!satisfiesRequirement(courseId, uniqueSet, registry)) {
      mathRemaining.push({ courseId });
    }
  }

  const mathBucket: BucketView = {
    id: 'math',
    label: 'Math',
    category: 'math',
    doneHours: Math.min(summary.mathHoursCompleted, summary.mathHoursTotal),
    totalHours: summary.mathHoursTotal,
    unit: 'hrs',
    complete: summary.mathHoursCompleted >= summary.mathHoursTotal,
    doneCount: degreeReqs.math_sequence.required.filter((id) =>
      satisfiesRequirement(id, uniqueSet, registry)
    ).length,
    totalCount: degreeReqs.math_sequence.required.length,
    countNoun: 'courses',
    remaining: mathRemaining,
  };

  // ── Physics ───────────────────────────────────────────────────────────────
  const physicsRemaining: BucketView['remaining'] = [];
  for (const courseId of degreeReqs.physics_sequence.required) {
    if (!satisfiesRequirement(courseId, uniqueSet, registry)) {
      physicsRemaining.push({ courseId });
    }
  }

  const physicsBucket: BucketView = {
    id: 'physics',
    label: 'Physics',
    category: 'math',
    doneHours: Math.min(summary.physicsCompleted, summary.physicsTotal),
    totalHours: summary.physicsTotal,
    unit: 'hrs',
    complete: summary.physicsCompleted >= summary.physicsTotal,
    doneCount: degreeReqs.physics_sequence.required.filter((id) =>
      satisfiesRequirement(id, uniqueSet, registry)
    ).length,
    totalCount: degreeReqs.physics_sequence.required.length,
    countNoun: 'courses',
    remaining: physicsRemaining,
    ruleNote: degreeReqs.physics_sequence.notes || undefined,
  };

  // ── Technical Component ───────────────────────────────────────────────────
  const techRemaining: BucketView['remaining'] = [];
  const req = techCore.required_courses;

  // Advanced math slot
  if (req.advanced_math && !satisfiesRequirement(req.advanced_math.id, uniqueSet, registry)) {
    techRemaining.push({ courseId: req.advanced_math.id });
  }

  // Core courses
  req.core?.forEach((entry) => {
    if (isTechCorePickOne(entry)) {
      const anyDone = entry.options.some((opt) =>
        satisfiesRequirement(opt.id, uniqueSet, registry)
      );
      if (!anyDone) {
        const ids = entry.options.map((o) => o.id).join(' / ');
        techRemaining.push({ note: `any of: ${ids}` });
      }
    } else {
      if (!satisfiesRequirement(entry.id, uniqueSet, registry)) {
        techRemaining.push({ courseId: entry.id });
      }
    }
  });

  // Core lab
  if (req.core_lab) {
    if (isTechCorePickOne(req.core_lab)) {
      const anyDone = req.core_lab.options.some((opt) =>
        satisfiesRequirement(opt.id, uniqueSet, registry)
      );
      if (!anyDone) {
        const ids = req.core_lab.options.map((o) => o.id).join(' / ');
        techRemaining.push({ note: `any of: ${ids}` });
      }
    } else {
      if (!satisfiesRequirement(req.core_lab.id, uniqueSet, registry)) {
        techRemaining.push({ courseId: req.core_lab.id });
      }
    }
  }

  // Required elective
  if (req.required_elective) {
    if (isTechCorePickOne(req.required_elective)) {
      const anyDone = req.required_elective.options.some((opt) =>
        satisfiesRequirement(opt.id, uniqueSet, registry)
      );
      if (!anyDone) {
        const ids = req.required_elective.options.map((o) => o.id).join(' / ');
        techRemaining.push({ note: `any of: ${ids}` });
      }
    } else {
      if (!satisfiesRequirement(req.required_elective.id, uniqueSet, registry)) {
        techRemaining.push({ courseId: req.required_elective.id });
      }
    }
  }

  // Elective pool deficit
  const electivesNeeded = techCore.elective_count?.general ?? 0;
  // How many elective slots are already filled (from the pool, not re-counting above)
  // Re-derive by subtracting required-slot done count from overall techCoreCompleted
  const requiredSlotsDone =
    (req.advanced_math && satisfiesRequirement(req.advanced_math.id, uniqueSet, registry) ? 1 : 0) +
    (req.core?.reduce((n, entry) => {
      if (isTechCorePickOne(entry)) {
        return n + (entry.options.some((o) => satisfiesRequirement(o.id, uniqueSet, registry)) ? 1 : 0);
      }
      return n + (satisfiesRequirement(entry.id, uniqueSet, registry) ? 1 : 0);
    }, 0) ?? 0) +
    (req.core_lab
      ? (isTechCorePickOne(req.core_lab)
          ? (req.core_lab.options.some((o) => satisfiesRequirement(o.id, uniqueSet, registry)) ? 1 : 0)
          : satisfiesRequirement(req.core_lab.id, uniqueSet, registry) ? 1 : 0)
      : 0) +
    (req.required_elective
      ? (isTechCorePickOne(req.required_elective)
          ? (req.required_elective.options.some((o) => satisfiesRequirement(o.id, uniqueSet, registry)) ? 1 : 0)
          : satisfiesRequirement(req.required_elective.id, uniqueSet, registry) ? 1 : 0)
      : 0);

  const electiveSlotsFilled = Math.min(
    Math.max(0, summary.techCoreCompleted - requiredSlotsDone),
    electivesNeeded
  );
  const electiveSlotsNeeded = Math.max(0, electivesNeeded - electiveSlotsFilled);
  if (electiveSlotsNeeded > 0) {
    techRemaining.push({
      note: `${electiveSlotsNeeded} tech elective${electiveSlotsNeeded !== 1 ? 's' : ''} from approved pool`,
    });
  }

  // Tech hours: sum required-courses hours + elective pool hours at TECH_CORE_TARGET slots
  // The spec says 29 hrs total; derive from the data:
  // required slots sum + (electivesNeeded * average elective hrs)
  // For simplicity: use 3 hrs per elective pool slot (most ECE electives = 3 hrs)
  const techRequiredHours =
    (req.advanced_math ? getCourseCredits(req.advanced_math.id, catalog, transcriptCredits) : 0) +
    (req.core?.reduce((s, entry) => {
      if (isTechCorePickOne(entry)) {
        return s + getCourseCredits(entry.options[0]?.id ?? '', catalog, transcriptCredits);
      }
      return s + getCourseCredits(entry.id, catalog, transcriptCredits);
    }, 0) ?? 0) +
    (req.core_lab
      ? (isTechCorePickOne(req.core_lab)
          ? getCourseCredits(req.core_lab.options[0]?.id ?? '', catalog, transcriptCredits)
          : getCourseCredits(req.core_lab.id, catalog, transcriptCredits))
      : 0) +
    (req.required_elective
      ? (isTechCorePickOne(req.required_elective)
          ? getCourseCredits(req.required_elective.options[0]?.id ?? '', catalog, transcriptCredits)
          : getCourseCredits(req.required_elective.id, catalog, transcriptCredits))
      : 0);
  const techElectiveHoursTotal = electivesNeeded * 3; // ECE upper-div electives default to 3 hrs
  const techTotalHours = techRequiredHours + techElectiveHoursTotal;

  // doneHours: sum of satisfied required slots + satisfied electives from pool
  const techRequiredDoneHours =
    (req.advanced_math && satisfiesRequirement(req.advanced_math.id, uniqueSet, registry)
      ? getCourseCredits(req.advanced_math.id, catalog, transcriptCredits)
      : 0) +
    (req.core?.reduce((s, entry) => {
      if (isTechCorePickOne(entry)) {
        const m = entry.options.find((o) => satisfiesRequirement(o.id, uniqueSet, registry));
        return s + (m ? getCourseCredits(m.id, catalog, transcriptCredits) : 0);
      }
      return (
        s +
        (satisfiesRequirement(entry.id, uniqueSet, registry)
          ? getCourseCredits(entry.id, catalog, transcriptCredits)
          : 0)
      );
    }, 0) ?? 0) +
    (req.core_lab
      ? isTechCorePickOne(req.core_lab)
        ? (() => {
            const m = req.core_lab.options.find((o) =>
              satisfiesRequirement(o.id, uniqueSet, registry)
            );
            return m ? getCourseCredits(m.id, catalog, transcriptCredits) : 0;
          })()
        : satisfiesRequirement(req.core_lab.id, uniqueSet, registry)
        ? getCourseCredits(req.core_lab.id, catalog, transcriptCredits)
        : 0
      : 0) +
    (req.required_elective
      ? isTechCorePickOne(req.required_elective)
        ? (() => {
            const m = req.required_elective.options.find((o) =>
              satisfiesRequirement(o.id, uniqueSet, registry)
            );
            return m ? getCourseCredits(m.id, catalog, transcriptCredits) : 0;
          })()
        : satisfiesRequirement(req.required_elective.id, uniqueSet, registry)
        ? getCourseCredits(req.required_elective.id, catalog, transcriptCredits)
        : 0
      : 0);

  // DONE hours for elective slots: sum actual credits of the pool courses the
  // student completed (a 4-hr elective must count as 4, not the proxy 3).
  // Cap at the number of filled slots so surplus pool courses don't over-count.
  const poolElectivesDone = techCore.elective_pool.filter(
    (id) => satisfiesRequirement(id, uniqueSet, registry) && !techCoreUsed.has(id)
  );
  const techElectiveDoneHours = Math.min(
    poolElectivesDone
      .slice(0, electiveSlotsFilled)
      .reduce((s, id) => s + getCourseCredits(id, catalog, transcriptCredits), 0),
    techElectiveHoursTotal
  );
  const techDoneHours = Math.min(
    techRequiredDoneHours + techElectiveDoneHours,
    techTotalHours
  );

  const techBucket: BucketView = {
    id: 'tech',
    label: 'Technical Component',
    category: 'tech_core',
    doneHours: techDoneHours,
    totalHours: techTotalHours,
    unit: 'hrs',
    complete: summary.techCoreCompleted >= TECH_CORE_TARGET,
    doneCount: summary.techCoreCompleted,
    totalCount: TECH_CORE_TARGET,
    countNoun: 'courses',
    remaining: techRemaining,
    ruleNote: degreeReqs.tech_core.description || undefined,
  };

  // ── Core Curriculum (Gen Ed) ──────────────────────────────────────────────
  const genEdSubReqs: NonNullable<BucketView['subRequirements']> = [];
  const genEdRemaining: BucketView['remaining'] = [];
  const genEdSlots = degreeReqs.core_curriculum.slots;

  for (const slot of genEdSlots) {
    const isDone = summary.completedGenEdSlots.has(slot.id);
    genEdSubReqs.push({
      label: slot.label,
      status: isDone ? 'done' : 'missing',
    });

    if (!isDone) {
      // Resolve options (handle same_as_his1 alias)
      let options = slot.options;
      if (options.includes('same_as_his1')) {
        const his1 = genEdSlots.find((s) => s.id === 'his1');
        if (his1) options = his1.options;
      }
      const enhanced = [...options];
      if (slot.id === 'vapa') enhanced.push('CTI 301G');
      if (slot.id === 'humanities') enhanced.push('CTI 302');

      if (enhanced.includes('list_of_approved')) {
        // No single canonical courseId — emit a note
        genEdRemaining.push({ note: `${slot.label} (${slot.hours} hrs, any approved course)` });
      } else {
        // Emit the first concrete option as the representative courseId,
        // and list alternatives in a note when there are multiple choices.
        const firstOption = enhanced[0];
        if (firstOption) {
          if (enhanced.length > 1) {
            genEdRemaining.push({
              courseId: firstOption,
              note: `any of: ${enhanced.join(' / ')}`,
            });
          } else {
            genEdRemaining.push({ courseId: firstOption });
          }
        }
      }
    }
  }

  // Read slot.hours from the data rather than assuming a fixed 3 per slot.
  const genEdTotalHours = genEdSlots.reduce((s, slot) => s + slot.hours, 0);
  // Completed hours = sum of hours for satisfied slots.
  const genEdDoneHours = genEdSlots
    .filter((slot) => summary.completedGenEdSlots.has(slot.id))
    .reduce((s, slot) => s + slot.hours, 0);

  // Dedupe genEdRemaining by courseId: a representative course (e.g. HIS 314K)
  // can appear as the first option for two distinct gen-ed slots (his1 + his2).
  // If both slots are unsatisfied we'd push the same courseId twice, causing a
  // duplicate React key. Keep the first occurrence; the slot count already tells
  // the user how many slots still need filling.
  const seenGenEdCourseIds = new Set<string>();
  const dedupedGenEdRemaining = genEdRemaining.filter((entry) => {
    if (!entry.courseId) return true; // note-only entries are always kept
    if (seenGenEdCourseIds.has(entry.courseId)) return false;
    seenGenEdCourseIds.add(entry.courseId);
    return true;
  });

  const genEdBucket: BucketView = {
    id: 'gen_ed',
    label: 'Core Curriculum',
    category: 'gen_ed',
    doneHours: genEdDoneHours,
    totalHours: genEdTotalHours,
    unit: 'hrs',
    complete: summary.genEdCompleted >= summary.genEdTotal,
    doneCount: summary.genEdCompleted,
    totalCount: summary.genEdTotal,
    countNoun: 'slots',
    subRequirements: genEdSubReqs,
    remaining: dedupedGenEdRemaining,
  };

  // ── Free Electives ─────────────────────────────────────────────────────────
  // Use the authoritative total from the degree catalog (11 hrs) rather than a
  // residual. The residual approach produced 13–14 depending on the tech-core
  // track because advanced_tech_elective hours were never included in any fixed
  // bucket, creating a phantom gap. Using the static value eliminates that error.
  const freeElecTotal = degreeReqs.free_electives.total_hours;
  const freeElecDone = Math.min(summary.electiveHours, freeElecTotal);
  const freeElecGap = Math.max(0, freeElecTotal - summary.electiveHours);
  const freeElecRemaining: BucketView['remaining'] = [];
  if (freeElecGap > 0) {
    freeElecRemaining.push({
      note: `${freeElecGap} hr${freeElecGap !== 1 ? 's' : ''} of free electives (unrestricted; see bit.ly/UTECE-FE)`,
    });
  }

  const freeElecBucket: BucketView = {
    id: 'free_elec',
    label: 'Free Electives',
    category: 'elective',
    doneHours: freeElecDone,
    totalHours: freeElecTotal,
    unit: 'hrs',
    complete: summary.electiveHours >= freeElecTotal,
    ruleNote: degreeReqs.free_electives.constraints?.[0] || undefined,
    remaining: freeElecRemaining,
  };

  return [eceCoreBucket, mathBucket, physicsBucket, techBucket, genEdBucket, freeElecBucket];
}
