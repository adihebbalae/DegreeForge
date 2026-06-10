// TODO(TASK-044): hardened against a representative IDA format only — needs a real UT IDA export to finalize field-order/section-header coverage.

import type { ParsedCourse } from './agent-tools/parse-transcript';

export type { ParsedCourse };

// ─── Known grade tokens ───────────────────────────────────────────────────────
// Matches letter grades (A–F with optional +/-), CR, NC, IP, Q, W.
// Uses a word boundary on the left and a negative alphanumeric lookahead on the
// right so that "B+" is captured whole (not just "B", since "+" is not a word
// char and \b would fire between "B" and "+").
const GRADE_RE = /\b(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|CR|NC|IP|Q|W)(?![A-Za-z0-9])/;

// ─── Course-code token ────────────────────────────────────────────────────────
// Matches patterns like: ECE 302, M 408C, PHY 303L, CS 314, E E 302
// Captured groups: (1) dept string, (2) course number + optional suffix letter.
const COURSE_CODE_RE = /\b((?:[A-Z]{1,4}\s+)+|E\s+E\s+)(\d{3}[A-Z]?)\b/;

// ─── Term token ───────────────────────────────────────────────────────────────
// Handles: Fall/FA, Spring/SP, Summer/SUM  followed by optional space + 4-digit year.
const TERM_RE = /\b(Fall|FA|Spring|SP|SUM|Summer)\s?(\d{4})\b/i;

// ─── Credit-hours decimal ─────────────────────────────────────────────────────
// Matches standalone decimals like 3.0, 4.0, 1.5; must be word-boundary to avoid
// matching sub-strings of course numbers (e.g. "408").
const CREDIT_RE = /\b(\d+\.\d+)\b/;

// ─── Requirement-header heuristics ───────────────────────────────────────────
// Lines that are all-caps section headers, or start with known IDA metadata
// markers, should be skipped entirely.
const HEADER_RE = /^\+?\s*(NEEDS|EARNED|HOURS|REQUIRED|COMPLETE|INCOMPLETE|AREA|COMPONENT|SECTION|REQUIREMENT|MAJOR|CORE|ELECTIVE|FREE|UNIVERSITY|COURSE|CATALOG|ADVISOR|STUDENT|DEGREE|CLASSIFICATION|PLAN|SEMESTER|TERM|TOTAL|LIST)/i;

/**
 * Normalises a raw term string to the canonical "Season YYYY" format used
 * by SEMESTERS ids in PlanContext.constants.ts.
 *
 * Input forms accepted:
 *   "FA 2025", "FA2025"  → "Fall 2025"
 *   "SP 2026", "SP2026"  → "Spring 2026"
 *   "SUM 2025"           → "Summer 2025"
 *   "Fall 2025"          → "Fall 2025"  (already canonical)
 *   "Spring 2026"        → "Spring 2026"
 */
function normalizeTerm(season: string, year: string): string {
  const s = season.toUpperCase();
  if (s === 'FA' || s === 'FALL') return `Fall ${year}`;
  if (s === 'SP' || s === 'SPRING') return `Spring ${year}`;
  if (s === 'SUM' || s === 'SUMMER') return `Summer ${year}`;
  // Fallback: title-case whatever came in.
  return `${season.charAt(0).toUpperCase()}${season.slice(1).toLowerCase()} ${year}`;
}

/**
 * Extracts the course-title fragment from a line after the course-code token
 * and before the first grade/term/credit token.  Returns an empty string when
 * no title fragment can be isolated.
 */
function extractTitle(line: string, codeEnd: number): string {
  const rest = line.slice(codeEnd).trim();
  // Strip leading punctuation / separators common in IDA copy-paste.
  const cleaned = rest.replace(/^[-–—|:]\s*/, '');

  // Find the earliest position of a grade, term, or credit token and clip there.
  const stopMatches: number[] = [];

  const gm = cleaned.match(GRADE_RE);
  if (gm?.index !== undefined) stopMatches.push(gm.index);

  const tm = cleaned.match(TERM_RE);
  if (tm?.index !== undefined) stopMatches.push(tm.index);

  const cm = cleaned.match(CREDIT_RE);
  if (cm?.index !== undefined) stopMatches.push(cm.index);

  if (stopMatches.length === 0) return cleaned.trim();

  const stop = Math.min(...stopMatches);
  return cleaned.slice(0, stop).trim();
}

/**
 * Parses pasted plain text from a UT Austin Interactive Degree Audit (IDA)
 * into an array of ParsedCourse objects.
 *
 * - In-progress courses (IDA grade token "IP") are emitted with grade "IP".
 * - CR (credit) courses retain grade "CR".
 * - Requirement-section headers and over-300-char lines are skipped.
 * - "E E" department prefix is normalised to "ECE".
 * - Term abbreviations (FA/SP/SUM + year) are normalised to
 *   "Fall YYYY" / "Spring YYYY" / "Summer YYYY".
 */
export function parseIdaAudit(text: string): ParsedCourse[] {
  const lines = text.split('\n');
  const results: ParsedCourse[] = [];

  for (let raw of lines) {
    const line = raw.trim();

    // Skip empty and over-300-char lines (ReDoS guard).
    if (!line || line.length > 300) continue;

    // Skip obvious requirement/metadata header lines.
    if (HEADER_RE.test(line)) continue;

    // Normalise E E → ECE before any further matching.
    const normalised = line.replace(/\bE\s+E\b/g, 'ECE');

    // Must find a course-code token to emit anything.
    const codeMatch = normalised.match(COURSE_CODE_RE);
    if (!codeMatch || codeMatch.index === undefined) continue;

    const dept = codeMatch[1].trim().toUpperCase().replace(/\s+/g, ' ');
    const num  = codeMatch[2].trim().toUpperCase();
    const courseId = `${dept} ${num}`;
    const codeEnd = codeMatch.index + codeMatch[0].length;

    // Extract optional fields; defaults apply when absent.
    const gradeMatch = normalised.match(GRADE_RE);
    const grade = gradeMatch ? gradeMatch[1].toUpperCase() : '';

    const termMatch = normalised.match(TERM_RE);
    const semester = termMatch
      ? normalizeTerm(termMatch[1], termMatch[2])
      : '';

    const creditMatch = normalised.match(CREDIT_RE);
    const creditHours = creditMatch ? parseFloat(creditMatch[1]) : 0;

    const title = extractTitle(normalised, codeEnd);

    results.push({ courseId, title, grade, semester, creditHours });
  }

  return results;
}
