import type { ToolContext, ToolResult } from './types';

interface ParsedTime {
  start: number; // minutes from midnight
  end: number;
}

function parseTimeRange(timeStr: string): ParsedTime | null {
  // Example: "9:30am - 11:00am" or "2:00pm-3:30pm"
  const match = timeStr.match(/(\d+):(\d+)(am|pm)\s*-\s*(\d+):(\d+)(am|pm)/i);
  if (!match) return null;

  const toMinutes = (h: number, m: number, ampm: string): number => {
    let hour = h;
    if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12;
    if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0;
    return hour * 60 + m;
  };

  return {
    start: toMinutes(parseInt(match[1]), parseInt(match[2]), match[3]),
    end: toMinutes(parseInt(match[4]), parseInt(match[5]), match[6]),
  };
}

function daysOverlap(days1: string, days2: string): boolean {
  const set1 = new Set([...days1]);
  return [...days2].some(d => set1.has(d));
}

export function checkScheduleConflicts(ctx: ToolContext, args: Record<string, unknown>): ToolResult {
  const semesterId = String(args.semester_id ?? '').trim();
  if (!semesterId) {
    return { content: { error: 'semester_id is required' }, isError: true };
  }

  if (!ctx.fallSections) {
    return {
      content: {
        semester_id: semesterId,
        conflicts: [],
        note: 'No section data available for conflict detection',
      },
    };
  }

  const courseIds = ctx.plan[semesterId] ?? [];
  if (courseIds.length === 0) {
    return { content: { semester_id: semesterId, conflicts: [], courses_checked: 0 } };
  }

  // Collect all sections for courses in this semester
  const courseSections: Array<{
    courseId: string;
    days: string;
    time: ParsedTime;
    timeStr: string;
    instructor: string;
  }> = [];

  for (const courseId of courseIds) {
    const sectionData = ctx.fallSections.courses[courseId];
    if (!sectionData) continue;
    for (const section of sectionData.sections) {
      for (const meeting of section.meetings) {
        if (!meeting.days || !meeting.time || meeting.time === 'Arranged') continue;
        const parsed = parseTimeRange(meeting.time);
        if (!parsed) continue;
        courseSections.push({
          courseId,
          days: meeting.days,
          time: parsed,
          timeStr: meeting.time,
          instructor: section.instructor,
        });
      }
    }
  }

  const conflicts: Array<{
    course_a: string;
    course_b: string;
    overlap_days: string;
    time_a: string;
    time_b: string;
  }> = [];

  for (let i = 0; i < courseSections.length; i++) {
    for (let j = i + 1; j < courseSections.length; j++) {
      const a = courseSections[i];
      const b = courseSections[j];
      if (a.courseId === b.courseId) continue;

      if (
        daysOverlap(a.days, b.days) &&
        a.time.start < b.time.end &&
        b.time.start < a.time.end
      ) {
        conflicts.push({
          course_a: a.courseId,
          course_b: b.courseId,
          overlap_days: a.days,
          time_a: a.timeStr,
          time_b: b.timeStr,
        });
      }
    }
  }

  return {
    content: {
      semester_id: semesterId,
      courses_checked: courseIds.length,
      conflicts,
      has_conflicts: conflicts.length > 0,
    },
  };
}
