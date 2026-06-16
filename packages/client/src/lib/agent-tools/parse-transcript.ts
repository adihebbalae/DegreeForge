import type { ToolContext, ToolResult, ToolDefinition } from './types';
import type { CreditSource } from '../../types';

export interface ParsedCourse {
  courseId: string;
  title: string;
  grade: string;
  semester: string;
  creditHours: number;
  /**
   * Best-effort credit source heuristic.
   * Heuristics applied (in order):
   *   - grade token is "TR"/"TRANSFER" → 'transfer'
   *   - grade token is "AP" OR title/line contains "AP EXAM" / "ADV PLACEMENT" → 'ap'
   *   - grade token is "CBE"/"EXAM" or title contains "CREDIT BY EXAM"/"CLEP" → 'credit_by_exam'
   *   - otherwise → 'in_residence' (default; UT transcripts are mostly in-residence)
   */
  source: CreditSource;
}

/**
 * Infer a CreditSource from the raw grade token and line text.
 * Default is 'in_residence' — UT transcript lines without special markers
 * are assumed to be physically taken in that semester.
 */
function inferCreditSource(grade: string, rawLine: string): CreditSource {
  const g = grade.toUpperCase();
  const line = rawLine.toUpperCase();
  if (g === 'TR' || g === 'TRANSFER') return 'transfer';
  if (g === 'AP' || line.includes('AP EXAM') || line.includes('ADV PLACEMENT') || line.includes('ADVANCED PLACEMENT')) return 'ap';
  if (g === 'CBE' || g === 'EXAM' || line.includes('CREDIT BY EXAM') || line.includes('CLEP')) return 'credit_by_exam';
  return 'in_residence';
}

// ─── Academic Summary (UT "Academic Summary" PDF) ─────────────────────────────

/**
 * Returns true when the text looks like a UT Academic Summary PDF export.
 * Detection: the document contains at least one "<Term> Courses" section heading.
 * This heading is not present in the flat-paste format, so it is a safe
 * discriminator.
 */
function isAcademicSummaryFormat(text: string): boolean {
  return /\b(?:Fall|Spring|Summer)\s+\d{4}\s+Courses\b/.test(text);
}

// Matches "<Term> Courses" section headings, e.g. "Fall 2025 Courses".
const SECTION_HEADING_RE = /^((?:Fall|Spring|Summer)\s+\d{4})\s+Courses\s*$/i;

// Matches the column header line that appears after each section heading.
const COLUMN_HEADER_RE = /^Course\s+Title\s+Grade\s+Unique\s+Type\s+Credit\s+Hours\s+Grade\s+Points\s*$/i;

// Matches the GPA summary table header lines and footer lines that must not be
// parsed as courses. These lines never start with a valid course code.
const FOOTER_SKIP_RE = /^(?:Total\s+Hours|Lower\s+Division|Upper\s+Division|Graduate\s+Level|Overall\s*$|Hours:|GPA\s+Hours:|Grade\s+Points:|GPA:|Academic\s+Summary|The\s+University|EID:|Name:|School\s+\d+:|Major\s+\d+:|Date\s+Degree|Classification:|First\s+Semester|Last\s+Semester|Unofficial\s+Document|Page\s+\d+)/i;

// Matches a valid UT course code at the start of a line:
// 1–4 uppercase letters, a space, then a 3-digit number with optional letter suffix.
// After E E → ECE normalization, multi-token depts are already collapsed.
const COURSE_CODE_START_RE = /^([A-Z]{1,4})\s+(\d{3}[A-Z]?\d?)\s+(.*)/;

// Finds the grade token (letter grade or CR/NC/W/Q) followed by the unique number
// (1–5 digits) somewhere WITHIN the "rest" string (after the course code).
// Captured groups: (1) grade, (2) unique digits, (3) optional trailing content.
// The leading \s ensures we don't match inside a word (e.g. "B" inside "ALGEBRA").
const GRADE_UNIQUE_RE = /\s(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|CR|NC|W|Q)\s+(\d{1,5})(?:\s+(.*))?$/;

// Matches "In residence", "Transfer", or "Credit by" at the start of the type fragment.
const TYPE_RE = /^(In\s+residence|Transfer|Credit\s+by)\s*(.*)/i;

// Matches the "exam N.N" continuation line (second half of "Credit by\nexam").
const EXAM_CONTINUATION_RE = /^exam\s+(\d+\.\d+)/i;

// Matches a standalone "Credit by" line (the type cell wrapped to its own line).
const CREDIT_BY_LINE_RE = /^Credit\s+by\s*$/i;

// Matches credit hours (float) at the start of the type-fragment remainder.
const CREDIT_RE = /^(\d+\.\d+)/;

/**
 * Map a raw Type string from the Academic Summary to a CreditSource.
 * "Credit by [exam]" → 'credit_by_exam'
 * "Transfer"         → 'transfer'
 * "In residence"     → 'in_residence'
 */
function mapTypeToSource(type: string): CreditSource {
  const t = type.toLowerCase();
  if (t.startsWith('transfer')) return 'transfer';
  if (t.startsWith('credit by')) return 'credit_by_exam';
  return 'in_residence';
}

/**
 * Parse a UT Academic Summary PDF text export into ParsedCourse records.
 *
 * Algorithm:
 * 1. Walk lines tracking the current term via "<Season YYYY> Courses" headings.
 * 2. Skip column-header lines, page/document headers, and GPA-table footer lines.
 * 3. For each line that starts with a valid course code, extract: dept+num (course
 *    ID), everything before the grade as the title, the grade (letter or CR), the
 *    unique number, and the type fragment (may be on same line or following lines).
 *
 * The pdfjs text-reconstruction of the Academic Summary produces three layout
 * variants for the Type column:
 *   A) "In residence" / "Transfer" — same line as course row:
 *      `ECE 302 INTRO ELECTRICAL ENGINEERING B+ 18210 In residence 3.0 9.99`
 *   B) "Credit by exam" — split across THREE lines:
 *      Line 1: `RHE 306 RHETORIC AND WRITING CR 20127`  (no type or credits)
 *      Line 2: `Credit by`
 *      Line 3: `exam 3.0 0.00`
 *
 * The parser uses a two-stage pending state to handle variant B:
 *   Stage 1 (pendingNoType): course row parsed, waiting for the type line.
 *   Stage 2 (pendingCreditByExam): "Credit by" seen, waiting for "exam N.N".
 *
 * 4. CR-graded courses (Transfer / Credit by exam) are included as completed
 *    credit-only entries (grade field = "CR", excluded from GPA by callers).
 * 5. Lines over 300 chars are skipped (ReDoS guard inherited from flat-paste path).
 */
function parseAcademicSummary(text: string): ParsedCourse[] {
  const results: ParsedCourse[] = [];
  let currentTerm = '';

  interface PartialRow {
    courseId: string;
    title: string;
    grade: string;
    semester: string;
  }

  // Stage 1: course row parsed but type not yet seen (empty typeFragment).
  let pendingNoType: PartialRow | null = null;

  // Stage 2: "Credit by" seen, waiting for "exam N.N" to get credit hours.
  // Source is always 'credit_by_exam' at this stage.
  let pendingCreditByExam: (PartialRow & { source: CreditSource }) | null = null;

  const rawLines = text.split('\n');

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    // ── Stage 2: waiting for "exam N.N" continuation ──
    if (pendingCreditByExam !== null) {
      if (EXAM_CONTINUATION_RE.test(line)) {
        const m = EXAM_CONTINUATION_RE.exec(line)!;
        results.push({ ...pendingCreditByExam, creditHours: parseFloat(m[1]) });
        pendingCreditByExam = null;
        continue;
      }
      // Non-continuation line — flush with 0 credit hours (data loss, but safe).
      results.push({ ...pendingCreditByExam, creditHours: 0 });
      pendingCreditByExam = null;
      // Fall through to process current line normally.
    }

    // ── Stage 1: waiting for type line after a course row with empty typeFragment ──
    if (pendingNoType !== null) {
      if (CREDIT_BY_LINE_RE.test(line)) {
        // "Credit by" line found — advance to stage 2.
        pendingCreditByExam = { ...pendingNoType, source: 'credit_by_exam' };
        pendingNoType = null;
        continue;
      }
      // Unexpected line — the course had no type (malformed row). Emit with defaults.
      results.push({ ...pendingNoType, creditHours: 0, source: 'in_residence' });
      pendingNoType = null;
      // Fall through to process current line normally.
    }

    if (!line || line.length > 300) continue;

    // ── Section heading: "Fall 2025 Courses" → set current term ──
    const headingMatch = SECTION_HEADING_RE.exec(line);
    if (headingMatch) {
      // Normalize to "Season YYYY" with proper title case.
      const raw = headingMatch[1].trim();
      const spaceIdx = raw.lastIndexOf(' ');
      const season = raw.slice(0, spaceIdx);
      const year = raw.slice(spaceIdx + 1);
      currentTerm = `${season.charAt(0).toUpperCase()}${season.slice(1).toLowerCase()} ${year}`;
      continue;
    }

    // ── Column header row ──
    if (COLUMN_HEADER_RE.test(line)) continue;

    // ── Footer / document header lines ──
    if (FOOTER_SKIP_RE.test(line)) continue;

    // ── Course row ──
    // Normalize E E → ECE before matching.
    const normalized = line.replace(/\bE\s+E\b/g, 'ECE');

    const codeMatch = COURSE_CODE_START_RE.exec(normalized);
    if (!codeMatch) continue;

    const dept = codeMatch[1];
    const num = codeMatch[2];
    const courseId = `${dept} ${num}`;
    const rest = codeMatch[3]; // everything after "DEPT NUM "

    // Find "grade unique [type_and_rest]" pattern anywhere in rest.
    // The grade and unique together anchor the boundary between title and fields.
    const gradeUniqueMatch = GRADE_UNIQUE_RE.exec(rest);
    if (!gradeUniqueMatch) continue;

    // Title is everything in rest before the " grade unique" match.
    const matchStart = rest.indexOf(gradeUniqueMatch[0]);
    const title = rest.slice(0, matchStart).trim();
    const grade = gradeUniqueMatch[1].toUpperCase();
    const typeFragment = gradeUniqueMatch[3] ?? '';

    if (typeFragment === '') {
      // Empty type fragment: type is on the next line(s) — enter stage 1.
      pendingNoType = { courseId, title, grade, semester: currentTerm };
      continue;
    }

    // Type is on this line — parse it directly.
    const typeMatch = TYPE_RE.exec(typeFragment);
    if (!typeMatch) continue;

    const typeStr = typeMatch[1];
    const afterType = typeMatch[2];

    if (/^Credit\s+by$/i.test(typeStr.trim())) {
      // Rare: "Credit by" appears on the same line as the course but "exam N.N"
      // is still on the next line. Enter stage 2 directly.
      pendingCreditByExam = { courseId, title, grade, semester: currentTerm, source: 'credit_by_exam' };
      continue;
    }

    const source = mapTypeToSource(typeStr);
    const creditMatch = CREDIT_RE.exec(afterType.trim());
    const creditHours = creditMatch ? parseFloat(creditMatch[1]) : 0;

    results.push({ courseId, title, grade, semester: currentTerm, creditHours, source });
  }

  // Flush any remaining pending rows.
  if (pendingCreditByExam !== null) {
    results.push({ ...pendingCreditByExam, creditHours: 0 });
  }
  if (pendingNoType !== null) {
    results.push({ ...pendingNoType, creditHours: 0, source: 'in_residence' });
  }

  return results;
}

// ─── Flat-paste parser (existing logic, unchanged) ────────────────────────────

export function parseTranscript(transcriptText: string): ParsedCourse[] {
  // Detect and dispatch to the Academic Summary parser when the input looks like
  // a pdfjs-extracted UT Academic Summary document.
  if (isAcademicSummaryFormat(transcriptText)) {
    return parseAcademicSummary(transcriptText);
  }

  // ── Original flat-paste path ──────────────────────────────────────────────
  const lines = transcriptText.split('\n');
  const parsedCourses: ParsedCourse[] = [];

  // Basic heuristic matching for UT transcript format
  // Example: ECE 302 Intro to Electrical Eng A Fall 2025 3
  // Example: E E 302 ...
  // Pattern: (Dept) (Num) (Title) (Grade) (Semester) (Credits)
  // We'll use a regex that handles common spacing and tabs
  const transcriptRegex = /^([A-Z]+(?:\s[A-Z]+)*)\s+(\d+[A-Z]?)\s+(.+?)\s+([A-DFQW][+-]?|CR|NC)\s+((?:Fall|Spring|Summer)\s+\d{4})\s+(\d+)\s*$/i;

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
      const gradeToken = grade.trim().toUpperCase();

      parsedCourses.push({
        courseId: `${dept} ${num}`,
        title: title.trim(),
        grade: gradeToken,
        semester: semester.trim(),
        creditHours: parseInt(creditsStr, 10),
        source: inferCreditSource(gradeToken, normalizedLine),
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

            const courseIdMatch = courseIdRaw.match(/^([A-Z]+(?:\s[A-Z]+)*)\s+(\d+[A-Z]?)$/i);
            if (courseIdMatch) {
                let [_, dept, num] = courseIdMatch;
                dept = dept.trim().toUpperCase().replace(/^E\s*E$/, 'ECE');
                num = num.trim().toUpperCase();
                const gradeToken = gradeRaw.toUpperCase();

                parsedCourses.push({
                    courseId: `${dept} ${num}`,
                    title: titleRaw,
                    grade: gradeToken,
                    semester: semesterRaw,
                    creditHours: parseInt(creditsRaw, 10) || 0,
                    source: inferCreditSource(gradeToken, normalizedLine),
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        content: { error: `Failed to parse transcript: ${msg}` },
        isError: true,
      };
    }
  },
};
