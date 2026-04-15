import type { CourseSections, CourseSection, SectionMeeting, GradeDistributions } from '../types';

export interface ScheduledSection extends CourseSection {
  courseId: string;
  courseTitle: string;
}

export interface CandidateSchedule {
  sections: ScheduledSection[];
  totalGpa: number;
  avgGpa: number;
  score: number; // Weighted composite score
}

// ─── Time Parsing ────────────────────────────────────────────────────────────

/** Converts "9:00 a.m." to minutes from midnight (540) */
function parseTime(timeStr: string): number {
  const match = timeStr.toLowerCase().match(/(\d+):(\d+)\s*([ap]\.m\.)/);
  if (!match) return 0;

  let [_, hours, mins, ampm] = match;
  let h = parseInt(hours);
  const m = parseInt(mins);

  if (ampm.startsWith('p') && h < 12) h += 12;
  if (ampm.startsWith('a') && h === 12) h = 0;

  return h * 60 + m;
}

/** Returns [startMinutes, endMinutes] for "9:00 a.m.-10:30 a.m." */
function parseInterval(intervalStr: string): [number, number] | null {
  const parts = intervalStr.split('-');
  if (parts.length !== 2) return null;
  return [parseTime(parts[0]), parseTime(parts[1])];
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
 * Computes a weighted score for a schedule based on:
 * - Average GPA (40%)
 * - Time preference (Morning vs Afternoon) (30%) - Placeholder
 * - Instruction mode (Face-to-face preferred) (30%)
 */
function scoreSchedule(
  sections: ScheduledSection[],
  gradeDistributions: GradeDistributions
): number {
  let gpaSum = 0;
  let faceToFaceCount = 0;

  sections.forEach(s => {
    // Average GPA for this course
    const courseGrades = gradeDistributions[s.courseId];
    if (courseGrades) {
      gpaSum += courseGrades.avg_gpa;
    } else {
      gpaSum += 3.0; // Fallback
    }

    if (s.instruction_mode === 'Face-to-face') faceToFaceCount++;
  });

  const avgGpa = gpaSum / sections.length;
  const faceToFacePct = faceToFaceCount / sections.length;

  // Normalized GPA (assuming 2.5 to 4.0 range)
  const gpaScore = Math.max(0, (avgGpa - 2.5) / 1.5);

  return (gpaScore * 0.7) + (faceToFacePct * 0.3);
}

// ─── Generation ───────────────────────────────────────────────────────────────

export function generateSchedules(
  selectedCourses: CourseSections[],
  gradeDistributions: GradeDistributions
): CandidateSchedule[] {
  const results: CandidateSchedule[] = [];

  function backtrack(index: number, current: ScheduledSection[]) {
    if (index === selectedCourses.length) {
      const gpaSum = current.reduce((sum, s) => {
        const grade = gradeDistributions[s.courseId];
        return sum + (grade?.avg_gpa ?? 3.0);
      }, 0);
      const avgGpa = gpaSum / current.length;
      
      results.push({
        sections: [...current],
        totalGpa: gpaSum,
        avgGpa,
        score: scoreSchedule(current, gradeDistributions),
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
