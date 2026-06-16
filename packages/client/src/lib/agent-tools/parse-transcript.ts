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
// Group 3 captures everything after the course number (may be empty).
const COURSE_CODE_START_RE = /^([A-Z]{1,4})\s+(\d{3}[A-Z]?\d?)(?:\s+(.*))?$/;

// Finds the grade token (letter grade or CR/NC/W/Q) followed by the unique number
// (1–5 digits) somewhere WITHIN a string.
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
 * Real pdfjs extraction behaviour (observed from the actual PDF):
 * - Every content line is followed by a blank line (pdfjs y-delta newlines).
 * - Long course rows are split across MULTIPLE content lines by pdfjs:
 *     Line 1: just the course code              e.g. "M 408C"
 *     Line 2: first part of the title            e.g. "DIFFEREN AND INTEGRAL"
 *     Line 3: rest of title + grade + fields     e.g. "CALCULUS CR 26050"
 * - Credit-by-exam type is always on two follow-on lines:
 *     "Credit by"  then  "exam N.N 0.00"
 * - Page-break artifacts appear between pages:
 *     "Academic Summary Unofficial Document Page N of 2"
 *     repeated column header
 *
 * The state machine uses four stages:
 *   idle            — scanning for section headings or course code lines
 *   pendingCourse   — accumulated a course code (+partial title), waiting for
 *                     the line that contains the grade+unique
 *   pendingNoType   — grade/unique found, type not yet seen; waiting for type line
 *   pendingCBE      — "Credit by" seen; waiting for "exam N.N" line
 *
 * Blank lines and lines > 300 chars are skipped in ALL states (transparent to
 * the state machine — they never flush a pending row).
 */
function parseAcademicSummary(text: string): ParsedCourse[] {
  const results: ParsedCourse[] = [];
  let currentTerm = '';

  interface PartialRow {
    courseId: string;
    titleParts: string[];  // accumulated across continuation lines
    grade: string;
    semester: string;
  }

  // Stage: course code seen, accumulating title, waiting for line with grade+unique.
  let pendingCourse: { courseId: string; titleParts: string[]; semester: string } | null = null;

  // Stage: grade found, waiting for type line.
  let pendingNoType: PartialRow | null = null;

  // Stage: "Credit by" seen, waiting for "exam N.N".
  let pendingCBE: (PartialRow & { source: CreditSource }) | null = null;

  const rawLines = text.split('\n');

  for (const rawLine of rawLines) {
    const line = rawLine.trim();

    // Blank lines and over-length lines are transparent to ALL states.
    // Hoisted ABOVE pending checks so they never mis-flush a pending row.
    if (!line || line.length > 300) continue;

    // ── Stage: pendingCBE — waiting for "exam N.N" ──
    if (pendingCBE !== null) {
      if (EXAM_CONTINUATION_RE.test(line)) {
        const m = EXAM_CONTINUATION_RE.exec(line)!;
        const title = pendingCBE.titleParts.join(' ').trim();
        results.push({ ...pendingCBE, title, creditHours: parseFloat(m[1]) });
        pendingCBE = null;
        continue;
      }
      // Non-continuation, non-blank line — this is unexpected but shouldn't
      // swallow the line.  Flush the pending CBE with 0 credit hours (data loss
      // is better than dropping the following course row).
      const title = pendingCBE.titleParts.join(' ').trim();
      results.push({ ...pendingCBE, title, creditHours: 0 });
      pendingCBE = null;
      // Fall through to process current line normally.
    }

    // ── Stage: pendingNoType — waiting for type line ──
    if (pendingNoType !== null) {
      if (CREDIT_BY_LINE_RE.test(line)) {
        // Advance to pendingCBE — "exam N.N" expected next.
        pendingCBE = { ...pendingNoType, source: 'credit_by_exam' };
        pendingNoType = null;
        continue;
      }
      const typeMatch = TYPE_RE.exec(line);
      if (typeMatch) {
        // Type line found — complete the row.
        const typeStr = typeMatch[1];
        const afterType = typeMatch[2];
        if (/^Credit\s+by$/i.test(typeStr.trim()) && !afterType.trim()) {
          // "Credit by" but "exam N.N" still on the next line.
          pendingCBE = { ...pendingNoType, source: 'credit_by_exam' };
          pendingNoType = null;
          continue;
        }
        const source = mapTypeToSource(typeStr);
        const creditMatch = CREDIT_RE.exec(afterType.trim());
        const creditHours = creditMatch ? parseFloat(creditMatch[1]) : 0;
        const title = pendingNoType.titleParts.join(' ').trim();
        results.push({ courseId: pendingNoType.courseId, title, grade: pendingNoType.grade, semester: pendingNoType.semester, creditHours, source });
        pendingNoType = null;
        continue;
      }
      // Any other non-blank, non-type line while waiting for type:
      // treat as a title continuation (shouldn't normally happen but guards
      // against unexpected PDF layout).
      pendingNoType.titleParts.push(line);
      continue;
    }

    // ── Stage: pendingCourse — accumulating title lines, waiting for grade+unique ──
    if (pendingCourse !== null) {
      // Normalize E E → ECE before trying to match a new course code.
      const normalized = line.replace(/\bE\s+E\b/g, 'ECE');

      // Check if this line contains the grade+unique — it may be a bare
      // continuation line (title fragment) or the final field line.
      // We try GRADE_UNIQUE_RE against the full normalized line.
      const gradeUniqueMatch = GRADE_UNIQUE_RE.exec(normalized);
      if (gradeUniqueMatch) {
        // This line ends with grade+unique (and optionally type).
        // Everything before the match is an additional title fragment.
        const matchStart = normalized.indexOf(gradeUniqueMatch[0]);
        const titleFragment = normalized.slice(0, matchStart).trim();
        if (titleFragment) pendingCourse.titleParts.push(titleFragment);

        const grade = gradeUniqueMatch[1].toUpperCase();
        const typeFragment = gradeUniqueMatch[3] ?? '';

        if (!typeFragment.trim()) {
          // Type on next line(s).
          pendingNoType = { courseId: pendingCourse.courseId, titleParts: pendingCourse.titleParts, grade, semester: pendingCourse.semester };
          pendingCourse = null;
          continue;
        }

        const typeMatch = TYPE_RE.exec(typeFragment);
        if (!typeMatch) {
          // Unrecognised type fragment — skip row.
          pendingCourse = null;
          continue;
        }

        const typeStr = typeMatch[1];
        const afterType = typeMatch[2];

        if (/^Credit\s+by$/i.test(typeStr.trim()) && !afterType.trim()) {
          pendingCBE = { courseId: pendingCourse.courseId, titleParts: pendingCourse.titleParts, grade, semester: pendingCourse.semester, source: 'credit_by_exam' };
          pendingCourse = null;
          continue;
        }

        const source = mapTypeToSource(typeStr);
        const creditMatch = CREDIT_RE.exec(afterType.trim());
        const creditHours = creditMatch ? parseFloat(creditMatch[1]) : 0;
        const title = pendingCourse.titleParts.join(' ').trim();
        results.push({ courseId: pendingCourse.courseId, title, grade, semester: pendingCourse.semester, creditHours, source });
        pendingCourse = null;
        continue;
      }

      // No grade found — check if this is a new course code line (new course
      // starting, which would mean the previous one was malformed — discard it).
      const codeMatch2 = COURSE_CODE_START_RE.exec(normalized);
      if (codeMatch2 && codeMatch2[3] === undefined) {
        // New bare course code — discard previous pending and start fresh.
        pendingCourse = { courseId: `${codeMatch2[1]} ${codeMatch2[2]}`, titleParts: [], semester: currentTerm };
        continue;
      }

      // Title continuation line — skip known skip-lines first.
      if (SECTION_HEADING_RE.test(line) || COLUMN_HEADER_RE.test(line) || FOOTER_SKIP_RE.test(line)) {
        // A structural line appeared before the grade — the pending course was
        // malformed (0-credit or layout anomaly).  Discard it.
        pendingCourse = null;
        // Fall through to process the structural line.
      } else {
        pendingCourse.titleParts.push(line);
        continue;
      }
    }

    // ── Normal scanning (idle state) ──

    // Section heading: "Fall 2025 Courses" → set current term.
    const headingMatch = SECTION_HEADING_RE.exec(line);
    if (headingMatch) {
      const raw = headingMatch[1].trim();
      const spaceIdx = raw.lastIndexOf(' ');
      const season = raw.slice(0, spaceIdx);
      const year = raw.slice(spaceIdx + 1);
      currentTerm = `${season.charAt(0).toUpperCase()}${season.slice(1).toLowerCase()} ${year}`;
      continue;
    }

    // Column header row — skip.
    if (COLUMN_HEADER_RE.test(line)) continue;

    // Footer / document header lines — skip.
    if (FOOTER_SKIP_RE.test(line)) continue;

    // Normalize E E → ECE before attempting course-code match.
    const normalized = line.replace(/\bE\s+E\b/g, 'ECE');

    const codeMatch = COURSE_CODE_START_RE.exec(normalized);
    if (!codeMatch) continue;

    const dept = codeMatch[1];
    const num = codeMatch[2];
    const courseId = `${dept} ${num}`;
    const rest = codeMatch[3] ?? ''; // everything after "DEPT NUM" (may be empty)

    if (!rest.trim()) {
      // Bare course code line — enter pendingCourse to accumulate title.
      pendingCourse = { courseId, titleParts: [], semester: currentTerm };
      continue;
    }

    // Try to find grade+unique in the rest of this line.
    const gradeUniqueMatch = GRADE_UNIQUE_RE.exec(rest);
    if (!gradeUniqueMatch) {
      // Title present but no grade yet — enter pendingCourse with the partial title.
      pendingCourse = { courseId, titleParts: [rest.trim()], semester: currentTerm };
      continue;
    }

    // Full or partial row with grade on same line as code.
    const matchStart = rest.indexOf(gradeUniqueMatch[0]);
    const title = rest.slice(0, matchStart).trim();
    const grade = gradeUniqueMatch[1].toUpperCase();
    const typeFragment = gradeUniqueMatch[3] ?? '';

    if (!typeFragment.trim()) {
      // Type on next line(s) — enter pendingNoType.
      pendingNoType = { courseId, titleParts: title ? [title] : [], grade, semester: currentTerm };
      continue;
    }

    const typeMatch = TYPE_RE.exec(typeFragment);
    if (!typeMatch) continue;

    const typeStr = typeMatch[1];
    const afterType = typeMatch[2];

    if (/^Credit\s+by$/i.test(typeStr.trim()) && !afterType.trim()) {
      pendingCBE = { courseId, titleParts: title ? [title] : [], grade, semester: currentTerm, source: 'credit_by_exam' };
      continue;
    }

    const source = mapTypeToSource(typeStr);
    const creditMatch = CREDIT_RE.exec(afterType.trim());
    const creditHours = creditMatch ? parseFloat(creditMatch[1]) : 0;

    results.push({ courseId, title, grade, semester: currentTerm, creditHours, source });
  }

  // Flush any remaining pending rows at EOF.
  if (pendingCBE !== null) {
    results.push({ ...pendingCBE, title: pendingCBE.titleParts.join(' ').trim(), creditHours: 0 });
  }
  if (pendingNoType !== null) {
    results.push({ ...pendingNoType, title: pendingNoType.titleParts.join(' ').trim(), creditHours: 0, source: 'in_residence' });
  }
  // pendingCourse at EOF = malformed/incomplete row, discard.

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
