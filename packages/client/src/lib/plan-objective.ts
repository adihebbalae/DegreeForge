/**
 * plan-objective.ts — TASK-068
 *
 * Pure, deterministic objective functions over a candidate degree plan.
 * No React, no I/O, no randomness. Same input → same output. Safe for unit tests.
 *
 * The "easiest" planner mode optimizes for a low aggregate difficulty / high
 * expected GPA using the real grade-distribution Stress Score (stress-score.ts +
 * grade-distributions.ts). These functions express that objective so the solver
 * and the UI readout share one definition of "how hard is this plan".
 *
 * Two concerns are kept separate:
 *   1. scoreCandidatePlan — the OBJECTIVE the solver minimizes when arranging a
 *      plan in `easiest` mode. Lower is better. It combines total aggregate
 *      stress with a difficulty-balance penalty (so hard courses spread across
 *      terms rather than piling into one brutal semester).
 *   2. summarizePlanDifficulty — the human-facing READOUT (aggregate difficulty,
 *      expected GPA, graduation term) the Header surfaces so the fastest↔easiest
 *      tradeoff is honest and visible.
 */

import { computeSemesterStress } from './stress-score';
import { getCourseGradeStats } from './grade-distributions';
import type { Plan, Semester } from '../types';

/** GPA assumed for a course with no grade-distribution data (scale midpoint-ish). */
export const NEUTRAL_EXPECTED_GPA = 3.0;

/** A course's resolved credit hours (canonical accessor, e.g. getCourseCredits). */
export type ResolveCredits = (courseId: string) => number;

/** Per-semester stress contribution used by both the objective and the readout. */
export interface SemesterStressContribution {
  semesterId: string;
  /** 0–100 weighted-mean difficulty for this term (0 for empty/transcript-only terms). */
  score: number;
  /** Credit hours that contributed to the score (in-residence future credits). */
  credits: number;
}

/**
 * Compute the per-future-semester stress contribution of a plan.
 *
 * Only FUTURE semesters are scored — past/current terms are transcript history
 * the student already lived through and are never re-optimized.
 *
 * @param termLoadCredits  course-id → credit hours for completed/in-progress
 *                         courses (AP/transfer → 0). Future courses fall back to
 *                         resolveCredits. Pass {} when only future courses matter.
 */
export function computePlanStressContributions(
  plan: Plan,
  semesters: Semester[],
  resolveCredits: ResolveCredits,
  termLoadCredits: Record<string, number> = {},
): SemesterStressContribution[] {
  const out: SemesterStressContribution[] = [];
  for (const sem of semesters) {
    if (sem.status !== 'future') continue;
    const courseIds = plan[sem.id] ?? [];
    const result = computeSemesterStress(courseIds, termLoadCredits, resolveCredits);
    const credits = result.courses.reduce((s, c) => s + c.creditHours, 0);
    out.push({ semesterId: sem.id, score: result.score, credits });
  }
  return out;
}

/**
 * Weight on the difficulty-balance penalty in scoreCandidatePlan.
 *
 * The objective is `aggregateStress + BALANCE_WEIGHT * spread`, where `spread`
 * is the population standard deviation of per-term stress scores. A small weight
 * is enough to break ties toward arrangements that spread hard courses, without
 * letting balance override the primary goal (low aggregate difficulty).
 */
export const BALANCE_WEIGHT = 0.5;

export interface CandidateScore {
  /** Credit-weighted mean difficulty across all future terms (0–100). */
  aggregateStress: number;
  /** Population standard deviation of per-term stress scores (spread, 0+). */
  spread: number;
  /** The value the solver minimizes: aggregateStress + BALANCE_WEIGHT * spread. */
  cost: number;
}

/**
 * Score a candidate plan for the `easiest` objective. LOWER cost is better.
 *
 * - aggregateStress: credit-weighted mean per-course difficulty across all
 *   future terms (a plan that picks lower-stress courses / placements scores
 *   lower here).
 * - spread: standard deviation of per-term stress; penalizing it nudges the
 *   solver to balance hard courses across terms instead of front-loading.
 *
 * Pure function over the candidate plan — no React, no solver state.
 */
export function scoreCandidatePlan(
  plan: Plan,
  semesters: Semester[],
  resolveCredits: ResolveCredits,
  termLoadCredits: Record<string, number> = {},
): CandidateScore {
  const contributions = computePlanStressContributions(
    plan,
    semesters,
    resolveCredits,
    termLoadCredits,
  );

  // Aggregate = credit-weighted mean difficulty across future terms.
  let weightedSum = 0;
  let totalCredits = 0;
  for (const c of contributions) {
    weightedSum += c.score * c.credits;
    totalCredits += c.credits;
  }
  const aggregateStress = totalCredits > 0 ? weightedSum / totalCredits : 0;

  // Spread = population std-dev of per-term scores over non-empty future terms.
  const scored = contributions.filter((c) => c.credits > 0).map((c) => c.score);
  let spread = 0;
  if (scored.length > 1) {
    const mean = scored.reduce((s, v) => s + v, 0) / scored.length;
    const variance =
      scored.reduce((s, v) => s + (v - mean) * (v - mean), 0) / scored.length;
    spread = Math.sqrt(variance);
  }

  const cost = aggregateStress + BALANCE_WEIGHT * spread;
  return { aggregateStress, spread, cost };
}

// ─── Human-facing readout ─────────────────────────────────────────────────────

export interface PlanDifficultySummary {
  /**
   * PEAK per-term stress across future terms (0–100): the worst semester's
   * difficulty. This is the placement-sensitive aggregate the readout surfaces —
   * 'easiest' lowers it by spreading hard courses, 'fastest' may spike it.
   * (Credit-weighted MEAN difficulty is placement-invariant for a fixed course
   * set, so it would not change between modes and is not used here.)
   */
  aggregateDifficulty: number;
  /** Credit-weighted expected GPA across future courses (0–4.0), or null if no future courses. */
  expectedGpa: number | null;
  /** ID of the last future semester that contains any placed course, or null. */
  graduationSemesterId: string | null;
  /** Count of future courses with real grade data (coverage). */
  coursesWithData: number;
  /** Total future courses considered for the readout (coverage denominator). */
  totalCourses: number;
}

/**
 * Build the human-facing readout for the fastest↔easiest tradeoff: aggregate
 * difficulty, credit-weighted expected GPA, and the graduation term.
 *
 * The expected GPA is the credit-weighted mean of each future course's grade
 * distribution mean GPA (NEUTRAL_EXPECTED_GPA when a course has no data), so the
 * student sees the GPA-not-speed tradeoff honestly.
 */
export function summarizePlanDifficulty(
  plan: Plan,
  semesters: Semester[],
  resolveCredits: ResolveCredits,
): PlanDifficultySummary {
  const contributions = computePlanStressContributions(plan, semesters, resolveCredits);
  const peakStress = contributions.reduce((max, c) => (c.score > max ? c.score : max), 0);

  let gpaWeightedSum = 0;
  let gpaCredits = 0;
  let coursesWithData = 0;
  let totalCourses = 0;
  let graduationSemesterId: string | null = null;

  for (const sem of semesters) {
    if (sem.status !== 'future') continue;
    const courseIds = plan[sem.id] ?? [];
    if (courseIds.length > 0) graduationSemesterId = sem.id;

    for (const courseId of courseIds) {
      if (typeof courseId !== 'string' || !courseId) continue;
      totalCourses++;
      const credits = resolveCredits(courseId);
      const stats = getCourseGradeStats(courseId);
      const gpa = stats === undefined ? NEUTRAL_EXPECTED_GPA : stats.gpa_mean;
      if (stats !== undefined) coursesWithData++;
      gpaWeightedSum += gpa * credits;
      gpaCredits += credits;
    }
  }

  return {
    aggregateDifficulty: Math.round(peakStress),
    expectedGpa: gpaCredits > 0 ? Math.round((gpaWeightedSum / gpaCredits) * 100) / 100 : null,
    graduationSemesterId,
    coursesWithData,
    totalCourses,
  };
}
