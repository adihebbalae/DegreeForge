import type { CourseSections, CourseSection, SectionMeeting, GradeDistributions } from '../types';
import {
  scoreScheduleFull,
  parseInterval,
  DEFAULT_WEIGHTS,
  type ScoreWeights,
  type FactorScores,
  type ScheduleScoringOptions,
} from './score';

export type { ScoreWeights, FactorScores };

export interface ScheduledSection extends CourseSection {
  courseId: string;
  courseTitle: string;
}

export interface CandidateSchedule {
  sections: ScheduledSection[];
  totalGpa: number;
  avgGpa: number;
  score: number; // Weighted composite score
  /** Per-factor breakdown for "Why this schedule?" display */
  factorScores?: FactorScores;
  /** Weights used during scoring (for breakdown display) */
  weights?: ScoreWeights;
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

/** Returns true if two meeting times overlap */
function meetingsOverlap(m1: SectionMeeting, m2: SectionMeeting): boolean {
  if (!m1.days || !m2.days) return false; // If one is TBA, assume no conflict for now

  // Check if they share any days (e.g. "MWF" and "TR" = no, "MW" and "WF" = yes)
  const days1 = m1.days.split('');
  const days2 = m2.days.split('');
  const sharedDay = days1.some(d => days2.includes(d));
  if (!sharedDay) return false;

  const i1 = parseInterval(m1.time);
  const i2 = parseInterval(m2.time);
  if (!i1 || !i2) return false;

  // Overlap if (StartA < EndB) AND (EndA > StartB)
  return i1[0] < i2[1] && i1[1] > i2[0];
}

/** Returns true if a section conflicts with any already-scheduled sections */
function sectionConflicts(section: CourseSection, scheduled: ScheduledSection[]): boolean {
  for (const s of scheduled) {
    for (const m1 of section.meetings) {
      for (const m2 of s.meetings) {
        if (meetingsOverlap(m1, m2)) return true;
      }
    }
  }
  return false;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Computes a composite score for a schedule using all 6 factors from score.ts.
 * Backward-compatible: pass only a subset of weights; unset factors default to 0.
 *
 * Returns both the numeric composite and per-factor breakdown.
 */
function scoreScheduleComposite(
  sections: ScheduledSection[],
  options: Partial<ScheduleScoringOptions> & { gradeDistributions: GradeDistributions }
): { score: number; factorScores: FactorScores; weights: ScoreWeights } {
  const weights: ScoreWeights = {
    ...DEFAULT_WEIGHTS,
    ...(options.weights ?? {}),
  };
  const result = scoreScheduleFull(sections, {
    weights,
    gradeDistributions: options.gradeDistributions,
    preferredWindows: options.preferredWindows ?? [],
    buildingDistances: options.buildingDistances ?? {},
    preferredMode: options.preferredMode ?? null,
    daySpreadPreference: options.daySpreadPreference ?? null,
    profPreferences: options.profPreferences ?? [],
  });
  return { score: result.composite, factorScores: result.factors, weights };
}

// ─── Generation ───────────────────────────────────────────────────────────────

/**
 * Hard node budget for the backtracking search.
 *
 * Each call to `backtrack` counts as one node. At ~50 k nodes the search
 * completes well under 100 ms on the main thread even with expensive section
 * data, so the tab stays responsive.  A Web Worker could lift this cap while
 * keeping the UI smooth, but that is heavier infrastructure — deferred.
 */
export const SEARCH_NODE_BUDGET = 50_000;

export interface GenerateSchedulesResult {
  candidates: CandidateSchedule[];
  /** True when the node budget was exhausted before the full product was explored. */
  truncated: boolean;
}

export function generateSchedules(
  selectedCourses: CourseSections[],
  gradeDistributions: GradeDistributions,
  scoringOptions?: Partial<ScheduleScoringOptions>
): GenerateSchedulesResult {
  const results: CandidateSchedule[] = [];
  let nodesVisited = 0;
  let truncated = false;

  function backtrack(index: number, current: ScheduledSection[]): void {
    nodesVisited++;
    if (nodesVisited > SEARCH_NODE_BUDGET) {
      truncated = true;
      return;
    }

    if (index === selectedCourses.length) {
      const gpaSum = current.reduce((sum, s) => {
        const grade = gradeDistributions[s.courseId];
        return sum + (grade?.avg_gpa ?? 3.0);
      }, 0);
      // Guard: empty selection produces 0/0 → return 0 instead of NaN
      const avgGpa = current.length > 0 ? gpaSum / current.length : 0;

      const { score, factorScores, weights } = scoreScheduleComposite(current, {
        ...scoringOptions,
        gradeDistributions,
      });

      results.push({
        sections: [...current],
        totalGpa: gpaSum,
        avgGpa,
        score,
        factorScores,
        weights,
      });
      return;
    }

    const course = selectedCourses[index];
    for (const section of course.sections) {
      if (truncated) return;
      if (section.status === 'cancelled') continue;
      if (!sectionConflicts(section, current)) {
        backtrack(index + 1, [
          ...current,
          { ...section, courseId: course.course, courseTitle: course.title },
        ]);
      }
    }
  }

  backtrack(0, []);

  // Rank by score descending and take top 5
  const candidates = results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return { candidates, truncated };
}
