/**
 * useStressScore — TASK-059
 *
 * Maps the current plan + profile + semesters to per-semester Stress Score results.
 * Memoized to re-run only when the plan, semesters, or user profile changes.
 *
 * Mirrors the useDiagnostics pattern (same data-assembly, same memoization style).
 *
 * Integration note: grade-distributions.ts was intentionally left unwired in
 * DataContext (the stale comment referenced "TASK-044" which was reassigned to the
 * profile refactor). This hook consumes getCourseGradeStats() directly from the
 * standalone grade-distributions module — no DataContext change needed.
 */

import { useMemo } from 'react';
import { useSemesters, usePlan } from '@/context/PlanContext';
import { useCatalogRecord, usePrereqGraph, useUserProfile, useDataLoading } from '@/context/DataContext';
import { buildTermLoadCredits } from '@/lib/course-utils';
import { computeSemesterStress } from '@/lib/stress-score';
import type { SemesterStressResult } from '@/lib/stress-score';

/** Per-semester stress result, keyed by semesterId */
export type StressScoreMap = Map<string, SemesterStressResult>;

/**
 * Returns a Map<semesterId, SemesterStressResult> for every semester in the plan.
 * Returns null while data is loading.
 *
 * How credit-hours are resolved for each course:
 *   1. termLoadCredits (from buildTermLoadCredits): authoritative for completed/in-progress
 *      courses. AP/transfer/credit_by_exam → 0, so they don't inflate stress.
 *   2. catalogCredits (from the course catalog): used for future courses not yet
 *      in the transcript. Falls back to 3 if not in catalog either.
 */
export function useStressScore(): StressScoreMap | null {
  const loading = useDataLoading();
  const semesters = useSemesters();
  const plan = usePlan();
  const userProfile = useUserProfile();
  const catalog = useCatalogRecord();
  const prereqGraph = usePrereqGraph();

  return useMemo(() => {
    if (loading) return null;

    // Build credit-hours maps
    const termLoadCredits = buildTermLoadCredits(userProfile);

    // Catalog credits from the course catalog + prereq-graph nodes as fallback
    const catalogCredits: Record<string, number> = {};
    if (catalog) {
      for (const [id, entry] of Object.entries(catalog)) {
        catalogCredits[id] = entry.credits;
      }
    }
    // Fill any gaps from prereq-graph node credits
    for (const [id, node] of Object.entries(prereqGraph.nodes)) {
      if (catalogCredits[id] === undefined) {
        catalogCredits[id] = node.credits;
      }
    }

    const result: StressScoreMap = new Map();
    for (const semester of semesters) {
      const courseIds = plan[semester.id] ?? [];
      result.set(
        semester.id,
        computeSemesterStress(courseIds, termLoadCredits, catalogCredits),
      );
    }

    return result;
  }, [loading, semesters, plan, userProfile, catalog, prereqGraph]);
}
