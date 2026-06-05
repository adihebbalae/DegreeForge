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
  });
  return { score: result.composite, factorScores: result.factors, weights };
}

// ─── Generation ───────────────────────────────────────────────────────────────

export function generateSchedules(
  selectedCourses: CourseSections[],
  gradeDistributions: GradeDistributions,
  scoringOptions?: Partial<ScheduleScoringOptions>
): CandidateSchedule[] {
  const results: CandidateSchedule[] = [];

  function backtrack(index: number, current: ScheduledSection[]) {
    if (index === selectedCourses.length) {
      const gpaSum = current.reduce((sum, s) => {
        const grade = gradeDistributions[s.courseId];
        return sum + (grade?.avg_gpa ?? 3.0);
      }, 0);
      const avgGpa = gpaSum / current.length;

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
      if (section.status === 'cancelled') continue;
      if (!sectionConflicts(section, current)) {
        backtrack(index + 1, [
          ...current,
          { ...section, courseId: course.course, courseTitle: course.title },
        ]);
      }

      // Limit to first 1000 combinations to prevent hang
      if (results.length >= 1000) return;
    }
  }

  backtrack(0, []);

  // Rank by score descending and take top 5
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
