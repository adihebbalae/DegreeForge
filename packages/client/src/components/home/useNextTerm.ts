/**
 * useNextTerm — TASK-076
 *
 * Derives the dashboard's "Next term" summary: the first FUTURE semester that has
 * any planned course, its course list, total in-residence credit hours, Stress
 * Score band, and whether any of its courses has an unmet (hard) prerequisite.
 *
 * Everything here is REUSED, not reinvented:
 *   - next term + its courses ← usePlan() / useSemesters() (PlanContext)
 *   - credit hours            ← getCourseCredits / buildTermLoadCredits (course-utils)
 *   - stress band             ← computeSemesterStress (stress-score.ts)
 *   - prereq status           ← useValidation() (the planner's own validator)
 *
 * The hook only assembles these existing signals for the home view; no new
 * planning, scoring, or validation logic is introduced.
 */

import { useMemo } from 'react';
import { useSemesters, usePlan } from '@/context/PlanContext';
import { useCatalogRecord, useUserProfile } from '@/context/DataContext';
import { useValidation } from '@/hooks/useValidation';
import {
  getCourseCredits,
  buildTermLoadCredits,
} from '@/lib/course-utils';
import { computeSemesterStress, type StressBand } from '@/lib/stress-score';

export interface NextTermSummary {
  /** Semester id / human label, e.g. "Fall 2026". */
  semesterId: string;
  /** Course ids placed in this term (plan order). */
  courseIds: string[];
  /** Total in-residence credit hours (AP/transfer count as 0). */
  totalCredits: number;
  /** 0–100 weighted Stress Score for the term. */
  stressScore: number;
  /** Low / medium / high band derived from the score. */
  stressBand: StressBand;
  /** True when at least one course in this term has an unmet HARD prerequisite. */
  hasPrereqIssue: boolean;
  /** Count of courses in this term flagged with a hard prereq violation. */
  prereqIssueCount: number;
}

/**
 * Returns the next planned future term's summary, or null when no future
 * semester contains any course yet (e.g. a brand-new empty plan).
 */
export function useNextTerm(): NextTermSummary | null {
  const semesters = useSemesters();
  const plan = usePlan();
  const catalog = useCatalogRecord();
  const profile = useUserProfile();
  const { violationsByCourse } = useValidation();

  return useMemo<NextTermSummary | null>(() => {
    // First future semester that actually has courses placed in it.
    const target = semesters.find(
      (s) => s.status === 'future' && (plan[s.id]?.length ?? 0) > 0
    );
    if (!target) return null;

    const courseIds = plan[target.id] ?? [];

    // Term-load credits: AP/transfer/credit-by-exam map to 0 (mirrors the planner).
    const termLoadCredits = buildTermLoadCredits(profile);
    const resolveCredits = (id: string) => getCourseCredits(id, catalog ?? {});

    const stress = computeSemesterStress(courseIds, termLoadCredits, resolveCredits);
    const totalCredits = stress.courses.reduce((sum, c) => sum + c.creditHours, 0);

    // Hard prereq issues only (soft past-term warnings are excluded by the same
    // rule the planner banner uses).
    const prereqIssueCount = courseIds.filter((id) => {
      const v = violationsByCourse[id];
      return v !== undefined && !v.isSoftWarning;
    }).length;

    return {
      semesterId: target.id,
      courseIds,
      totalCredits,
      stressScore: stress.score,
      stressBand: stress.band,
      hasPrereqIssue: prereqIssueCount > 0,
      prereqIssueCount,
    };
  }, [semesters, plan, catalog, profile, violationsByCourse]);
}
