import type { ToolContext, ToolResult, ToolDefinition } from './types';

export interface ParsedCourse {
  courseId: string;
  title: string;
  grade: string;
  semester: string;
  creditHours: number;
}

export function parseTranscript(transcriptText: string): ParsedCourse[] {
  const lines = transcriptText.split('\n');
  const parsedCourses: ParsedCourse[] = [];
  
  // Basic heuristic matching for UT transcript format
  // Example: ECE 302 Intro to Electrical Eng A Fall 2025 3
  // Example: E E 302 ...
  // Pattern: (Dept) (Num) (Title) (Grade) (Semester) (Credits)
  // We'll use a regex that handles common spacing and tabs
  const transcriptRegex = /^([A-Z\s]+?)\s+(\d+[A-Z]?)\s+(.+?)\s+([A-DFQW][+-]?|CR|NC)\s+((?:Fall|Spring|Summer)\s+\d{4})\s+(\d+)\s*$/i;

  for (let line of lines) {
    line = line.trim();
    // Skip empty and pathologically long lines (the latter guards the regex
    // below against catastrophic backtracking on crafted input).
    if (!line || line.length > 300) continue;
    
    // Normalize E E -> ECE
    let normalizedLine = line.replace(/^E\s*E\s+/, 'ECE ');

    const match = normalizedLine.match(transcriptRegex);
    if (match) {
      let [_, dept, num, title, grade, semester, creditsStr] = match;
      dept = dept.trim().toUpperCase();
      num = num.trim().toUpperCase();
      
      parsedCourses.push({
        courseId: `${dept} ${num}`,
        title: title.trim(),
        grade: grade.trim().toUpperCase(),
        semester: semester.trim(),
        creditHours: parseInt(creditsStr, 10),
      });
    } else {
        // Handle tab separated format
        const tabParts = normalizedLine.split(/\t+/);
        if (tabParts.length >= 5) {
            // Assume format: course_id, title, grade, semester, credits
            const courseIdRaw = tabParts[0].trim();
            const titleRaw = tabParts[1].trim();
            const gradeRaw = tabParts[2].trim();
            const semesterRaw = tabParts[3].trim();
            const creditsRaw = tabParts[4].trim();

            const courseIdMatch = courseIdRaw.match(/^([A-Z\s]+?)\s+(\d+[A-Z]?)$/i);
            if (courseIdMatch) {
                let [_, dept, num] = courseIdMatch;
                dept = dept.trim().toUpperCase().replace(/^E\s*E$/, 'ECE');
                num = num.trim().toUpperCase();
                
                parsedCourses.push({
                    courseId: `${dept} ${num}`,
                    title: titleRaw,
                    grade: gradeRaw.toUpperCase(),
                    semester: semesterRaw,
                    creditHours: parseInt(creditsRaw, 10) || 0,
                });
            }
        }
    }
  }

  return parsedCourses;
}

export const parseTranscriptTool: ToolDefinition = {
  name: 'parse_transcript',
  description: 'Parses raw text from a UT Austin transcript and extracts completed courses.',
  schema: {
    type: 'object',
    properties: {
      transcript_text: {
        type: 'string',
        description: 'Raw text copied from an academic transcript.',
      },
    },
    required: ['transcript_text'],
  },
  defaultEnabled: false,
  fn: (ctx: ToolContext, args: Record<string, unknown>): ToolResult => {
    const text = args.transcript_text;
    if (typeof text !== 'string') {
      return { content: { error: 'transcript_text must be a string' }, isError: true };
    }

    try {
      const courses = parseTranscript(text);
      return {
        content: { completed_courses: courses },
      };
    } catch (e: any) {
      return {
        content: { error: `Failed to parse transcript: ${e.message}` },
        isError: true,
      };
    }
  },
};
