/**
 * Parse UT CourseDocs (HB 2504) public-syllabi search results + extract
 * heuristic structured fields from the freeform syllabus PDF text.
 *
 * Two concerns live here, both pure (no network, no fs):
 *
 *   1. parseResultRows(html)  — cheerio over the public CourseDocs results
 *      table (one row per course-section-term) into typed records.
 *
 *   2. extractSyllabusFields(text) — best-effort regex/heuristic mining of a
 *      syllabus' plain text (from `pdftotext -layout`) into grading breakdown,
 *      topic/weekly schedule, textbooks, and a description excerpt.
 *
 * The CourseDocs results table layout (verified live, E E 302, 2026-06-13):
 *
 *   <table id="results_table">
 *     <thead><tr>
 *       <th>Semester</th><th>Course</th><th>Unique</th><th>Course Title</th>
 *       <th>Instructor(s)</th><th>CV(s)</th><th>Syllabus</th><th>Survey</th>
 *     </tr></thead>
 *     <tbody>
 *       <tr>
 *         <td>2022 Spring</td>
 *         <td>E E 302</td>
 *         <td class="align-left">17075</td>
 *         <td>Introduction to Electrical Engineering.</td>
 *         <td> Jack Lee <br> </td>
 *         <td><a href=".../download/11072751/" ...>Jack Lee CV</a></td>
 *         <td><a href=".../download/11811905/" title="download syllabus">Download</a></td>
 *         <td><a href="https://testingservices.utexas.edu/cis/...">View</a></td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * Heuristic extraction is intentionally best-effort: instructor PDFs share no
 * template, so we store the full text always (caller's job) and surface
 * high-confidence structured fields where the syllabus exposes them, degrading
 * to empty rather than guessing — the same "abort rather than emit garbage"
 * philosophy as the sections parser.
 */

import * as cheerio from 'cheerio';

// ─── Course-id normalization ─────────────────────────────────────────────────

/**
 * Normalize a raw CourseDocs course token ("E E 302") to the app's internal id
 * ("ECE 302"). CourseDocs uses "E E" (with a space) for ECE — the same quirk
 * the sections pipeline documents. Collapses internal whitespace so multi-space
 * tokens ("E E  302") still resolve. Other departments pass through unchanged
 * (e.g. "C S 314" → "C S 314", "M 408C" → "M 408C").
 */
export function normalizeCourseId(raw: string): string {
  return raw
    .replace(/^E\s+E\s+/i, 'ECE ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ─── Semester ordering ───────────────────────────────────────────────────────

/** Season → sort rank within a year (Spring < Summer < Fall). */
const SEASON_RANK: Record<string, number> = { spring: 1, summer: 2, fall: 3 };

/**
 * Convert a CourseDocs semester label ("2022 Spring", "2021 Fall") into a
 * numeric key that sorts chronologically (later term → larger number).
 * Returns 0 for an unrecognized label so it sinks below any real term.
 */
export function semesterSortKey(label: string): number {
  const m = /(\d{4})\s+(Spring|Summer|Fall)/i.exec(label.trim());
  if (!m) return 0;
  const year = Number(m[1]);
  const rank = SEASON_RANK[m[2].toLowerCase()] ?? 0;
  return year * 10 + rank;
}

// ─── Result-row parsing ──────────────────────────────────────────────────────

/** One parsed CourseDocs search-result row. */
export interface SyllabusRow {
  /** Normalized internal course id, e.g. "ECE 302". */
  course: string;
  /** Raw course token as shown on the page, e.g. "E E 302". */
  rawCourse: string;
  /** Semester label, e.g. "2022 Spring". */
  term: string;
  /** Unique section number as text (may be empty). */
  unique: string;
  /** Course title. */
  title: string;
  /** Instructor name(s), `<br>`-separated on the page, joined with ", ". */
  instructor: string;
  /** CourseDocs document id from the syllabus download href, or null. */
  docId: string | null;
  /** Absolute syllabus PDF download URL, or null when no syllabus posted. */
  pdfUrl: string | null;
}

const COURSEDOCS_ORIGIN = 'https://utdirect.utexas.edu';

/** Pull the numeric document id out of a `.../download/<id>/` href. */
export function docIdFromHref(href: string): string | null {
  const m = /\/download\/(\d+)\/?/.exec(href);
  return m ? m[1] : null;
}

/**
 * True when the HTML is a CourseDocs results page with at least one data row.
 * Returns a human-readable reason string when it is NOT parseable (login page,
 * empty search, or layout drift) — null when it looks good. Mirrors the
 * sections parser's detectNonScheduleHtml gate.
 */
export function detectNonResultsHtml(html: string): string | null {
  const head = html.slice(0, 6000).toLowerCase();
  if (head.includes('ut eid') || head.includes('utlogin') || head.includes('/idp/profile/saml')) {
    return 'Page is a UT login redirect — CourseDocs should be public; UT may have changed access.';
  }
  if (!html.includes('results_table')) {
    return 'No results_table found — either an empty/invalid search or UT changed the CourseDocs layout.';
  }
  return null;
}

/**
 * Parse the CourseDocs results table into typed rows. Skips header rows and any
 * row that does not have the expected cell count. Does not throw on individual
 * malformed rows — they are dropped so one bad row cannot abort the scrape.
 */
export function parseResultRows(html: string): SyllabusRow[] {
  const $ = cheerio.load(html);
  const rows: SyllabusRow[] = [];

  $('table#results_table tbody tr').each((_, tr) => {
    const tds = $(tr).find('td');
    // Expected layout has 8 cells; tolerate >=7 (Survey col sometimes absent).
    if (tds.length < 7) return;

    const term = tds.eq(0).text().trim();
    const rawCourse = tds.eq(1).text().replace(/\s+/g, ' ').trim();
    const unique = tds.eq(2).text().trim();
    const title = tds.eq(3).text().replace(/\s+/g, ' ').trim();

    // Instructor cell: <br>-separated names — join non-empty pieces.
    const instructorCell = tds.eq(4);
    const instructor = instructorCell.find('br').length
      ? instructorCell
          .contents()
          .toArray()
          .map((n) => $(n).text().trim())
          .filter(Boolean)
          .join(', ')
      : instructorCell.text().replace(/\s+/g, ' ').trim();

    // Syllabus link lives in the cell whose <a> has title="download syllabus".
    const sylAnchor = $(tr).find('a[title="download syllabus"]').first();
    const href = sylAnchor.attr('href') ?? '';
    const docId = href ? docIdFromHref(href) : null;
    const pdfUrl = href
      ? href.startsWith('http')
        ? href
        : `${COURSEDOCS_ORIGIN}${href}`
      : null;

    if (!rawCourse) return;

    rows.push({
      course: normalizeCourseId(rawCourse),
      rawCourse,
      term,
      unique,
      title,
      instructor,
      docId,
      pdfUrl,
    });
  });

  return rows;
}

/**
 * Group rows by normalized course id and, within each course, return the rows
 * that actually have a syllabus PDF, newest term first. De-duplicates by docId
 * (the same syllabus is listed once per section). Courses with no syllabus rows
 * are omitted.
 */
export function mostRecentSyllabiByCourse(rows: SyllabusRow[]): Map<string, SyllabusRow[]> {
  const byCourse = new Map<string, SyllabusRow[]>();

  for (const row of rows) {
    if (!row.pdfUrl || !row.docId) continue;
    const list = byCourse.get(row.course) ?? [];
    list.push(row);
    byCourse.set(row.course, list);
  }

  for (const [course, list] of byCourse) {
    const seen = new Set<string>();
    const deduped: SyllabusRow[] = [];
    // Newest term first; stable within a term.
    list.sort((a, b) => semesterSortKey(b.term) - semesterSortKey(a.term));
    for (const r of list) {
      const key = r.docId ?? r.pdfUrl ?? '';
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    byCourse.set(course, deduped);
  }

  return byCourse;
}

// ─── Heuristic field extraction from syllabus text ───────────────────────────

export interface GradingComponent {
  /** Component label, e.g. "Homework", "Final Exam". */
  component: string;
  /** Weight percentage as an integer, e.g. 25. */
  pct: number;
}

export interface SyllabusFields {
  /** Grading-weight breakdown (component → percent), best-effort. */
  grading: GradingComponent[];
  /** Topic / weekly-schedule lines, best-effort, capped. */
  topics: string[];
  /** Textbook / required-reading lines, best-effort, capped. */
  textbooks: string[];
  /** Short prose excerpt describing the course, best-effort. */
  descriptionExcerpt: string;
}

const GRADING_ANCHOR =
  /\b(grade\s*weight|grading|grade\s+breakdown|grade\s+distribution|course\s+grade|evaluation|assessment|grade\s+determination)/i;

const SCHEDULE_ANCHOR =
  /\b(course\s+outline|lecture\s+schedule|weekly\s+schedule|course\s+schedule|tentative\s+schedule|topics?\s+(?:covered|schedule)|schedule\s+of\s+topics|topic\s+outline)\b/i;

const TEXTBOOK_ANCHOR =
  /\b(required\s+text|recommended\s+text|textbook|course\s+materials?|required\s+reading|required\s+materials?)\b/i;

/** A label that plausibly names a grade component (left of a percentage). */
const COMPONENT_WORD =
  /\b(home\s?works?|hw|quiz(?:zes)?|exam(?:s|ination|inations)?|midterms?|finals?|final\s+exam|projects?|labs?|laborator(?:y|ies)|assignments?|participation|attendance|papers?|presentations?|reports?|essays?|class\s+work|discussion)\b/i;

/** Lines that look like boilerplate we never want as a "topic". */
const TOPIC_NOISE =
  /(office\s+hours|academic\s+integrity|disabilit|religious\s+holiday|@utexas|http|copyright|grad(?:e|ing)\s+scale|^\s*[A-F]\s*=)/i;

/** Split text into trimmed-right non-empty-aware lines (preserves leading indent). */
function lines(text: string): string[] {
  return text.split(/\r?\n/).map((l) => l.replace(/ /g, ' ').trimEnd());
}

/**
 * Extract grading components. Two strategies, combined:
 *
 *   (a) Inline prose: "Homework: 10%, Final Examination: 35%" — pull every
 *       "<word(s)> ... NN%" pair from the grading region.
 *   (b) Tabular/offset layout (pdftotext -layout can split a 2-col grading
 *       table so labels and percents land on adjacent lines) — within the
 *       grading region, collect component words and percentages and pair them
 *       positionally when (a) finds nothing.
 *
 * Percentages are clamped to 1..100; duplicates (same component) keep the first.
 */
export function extractGrading(text: string): GradingComponent[] {
  const ls = lines(text);
  const anchorIdx = ls.findIndex((l) => GRADING_ANCHOR.test(l));
  // Search a window after the anchor (grading tables are short); if no anchor,
  // scan the whole doc for the inline pattern only (safer than guessing region).
  const region =
    anchorIdx >= 0 ? ls.slice(anchorIdx, anchorIdx + 25).join('\n') : text;

  const out: GradingComponent[] = [];
  const seen = new Set<string>();

  const push = (rawLabel: string, pct: number): void => {
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) return;
    const component = rawLabel.replace(/\s+/g, ' ').trim();
    if (!component) return;
    const key = component.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ component, pct });
  };

  // (a) Inline "<label> ... NN%" — label is the trailing component phrase.
  // The label class allows an internal index ("Examination 1", "Exam #2") and
  // a separating colon/space before the percentage, so multi-exam weightings
  // ("Examination 1: 20%, Examination 2: 25%") are all captured.
  const inline = /([A-Za-z][A-Za-z0-9 #/&-]{1,40}?)\s*[:\-]?\s*(\d{1,3})\s*%/g;
  let m: RegExpExecArray | null;
  while ((m = inline.exec(region)) !== null) {
    const label = m[1].trim();
    if (!COMPONENT_WORD.test(label)) continue;
    push(label, Number(m[2]));
  }

  // (b) Positional fallback for split tables, only if inline found nothing.
  if (out.length === 0 && anchorIdx >= 0) {
    const regionLines = ls.slice(anchorIdx, anchorIdx + 25);
    const labels: string[] = [];
    const pcts: number[] = [];
    for (const line of regionLines) {
      const labelMatch = COMPONENT_WORD.exec(line);
      if (labelMatch) labels.push(labelMatch[0]);
      const pctMatch = /(\d{1,3})\s*%/.exec(line);
      if (pctMatch) pcts.push(Number(pctMatch[1]));
    }
    const n = Math.min(labels.length, pcts.length);
    for (let i = 0; i < n; i++) push(labels[i], pcts[i]);
  }

  return out;
}

/**
 * Extract topic/weekly-schedule lines. Anchors on a schedule header and
 * collects subsequent content-bearing lines (filtering obvious boilerplate),
 * capped at `cap`. Returns [] when no schedule section is found.
 */
export function extractTopics(text: string, cap = 30): string[] {
  const ls = lines(text);
  const anchorIdx = ls.findIndex((l) => SCHEDULE_ANCHOR.test(l) && l.trim().length < 80);
  if (anchorIdx < 0) return [];

  const out: string[] = [];
  for (let i = anchorIdx + 1; i < ls.length && out.length < cap; i++) {
    const line = ls[i].trim();
    if (line.length < 4) continue;
    if (TOPIC_NOISE.test(line)) continue;
    // Stop if we walk into a clearly different section header far from topics.
    if (/^(grading|academic|attendance|policies|disability)\b/i.test(line) && out.length > 3) {
      break;
    }
    out.push(line.replace(/\s{2,}/g, '  '));
  }
  return out;
}

/** A textbook citation almost always names a publisher, an edition, or an ISBN. */
const CITATION_MARKER =
  /\b(edition|\d(?:st|nd|rd|th)\s+ed|ed\.|press|mcgraw|hill|wiley|prentice|pearson|springer|cengage|oxford|cambridge|publishing|isbn)\b/i;

/** Policy / prose lines that look citation-ish (comma + year) but are NOT books. */
const TEXTBOOK_NOISE =
  /(^\s*\[\d+\]|homework|discussion of|purpose of|office hours|sharing of|prohibited|grading|funding|prepare for|every student|work through|allowed|encouraged|policy)/i;

/**
 * Extract textbook / required-reading lines. Anchors on a textbook header and
 * collects the following lines that look like a real citation — a publisher /
 * edition / ISBN marker — while rejecting policy prose that merely happens to
 * contain a comma and a year. Best-effort: drops to fewer/zero entries rather
 * than emit homework-policy sentences as "textbooks".
 */
export function extractTextbooks(text: string, cap = 8): string[] {
  const ls = lines(text);
  const out: string[] = [];
  const seen = new Set<string>();

  const add = (raw: string): void => {
    const t = raw.replace(/\s{2,}/g, ' ').trim();
    if (t.length < 8 || out.length >= cap) return;
    if (TEXTBOOK_NOISE.test(t)) return;
    if (!CITATION_MARKER.test(t)) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  for (let i = 0; i < ls.length; i++) {
    if (!TEXTBOOK_ANCHOR.test(ls[i])) continue;
    // Inline title on the anchor line itself ("Textbook: Author, Title, ...").
    const inline = ls[i].replace(TEXTBOOK_ANCHOR, '').replace(/^[\s:.\-]+/, '').trim();
    if (inline.length > 8 && /[A-Za-z]/.test(inline)) {
      add(`${inline} ${ls[i + 1]?.trim() ?? ''}`.trim());
    }
    // Following lines that look like citations.
    for (let j = i + 1; j < Math.min(i + 6, ls.length); j++) {
      const line = ls[j].trim();
      if (!line) continue;
      if (TEXTBOOK_ANCHOR.test(line)) break;
      add(line);
    }
  }
  return out;
}

/** Logistics noise that is never a course description (times, contacts, IDs). */
const LOGISTICS_NOISE =
  /(@|office\s+hours|unique\s*(?:number|:)|lecture[s]?\s*:|lab[s]?\s*:|instructor\s*:|teaching\s+assistant|\d{1,2}:\d{2}\s*(?:a\.?m\.?|p\.?m\.?)|\(\d{4,5}\)|semester\s+exams?\s*:|prerequisite)/i;

/**
 * Pull a short description excerpt: the first substantial prose paragraph
 * (joined wrapped lines) that reads like a course description rather than
 * logistics (times, emails, room/unique numbers) or boilerplate. Capped to
 * ~`maxChars` characters at a word boundary. Returns "" when nothing prose-like
 * is found — honest degradation, since many freeform syllabi front-load
 * logistics and never state a description.
 */
export function extractDescriptionExcerpt(text: string, maxChars = 600): string {
  const ls = lines(text);
  const buf: string[] = [];
  let started = false;

  for (const raw of ls) {
    const line = raw.trim();
    if (!started) {
      // The first line of a real description paragraph: a multi-word prose line
      // (not a header / contact / logistics line). A terminal period is NOT
      // required — the paragraph may wrap, so we start on the first prose line
      // and keep joining until a blank line or boilerplate.
      const wordCount = line.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
      const proseLike = line.length >= 50 && wordCount >= 8 && /[a-z]/.test(line);
      if (proseLike && !TOPIC_NOISE.test(line) && !LOGISTICS_NOISE.test(line)) {
        started = true;
        buf.push(line);
      }
      continue;
    }
    if (line.length === 0) break; // paragraph break
    if (TOPIC_NOISE.test(line) || LOGISTICS_NOISE.test(line)) break;
    buf.push(line);
    if (buf.join(' ').length >= maxChars) break;
  }

  let joined = buf.join(' ').replace(/\s{2,}/g, ' ').trim();
  if (joined.length > maxChars) {
    joined = joined.slice(0, maxChars);
    const lastSpace = joined.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.6) joined = joined.slice(0, lastSpace);
    joined = `${joined.trimEnd()}…`;
  }
  return joined;
}

/** Run all heuristic extractors over a syllabus' plain text. */
export function extractSyllabusFields(text: string): SyllabusFields {
  return {
    grading: extractGrading(text),
    topics: extractTopics(text),
    textbooks: extractTextbooks(text),
    descriptionExcerpt: extractDescriptionExcerpt(text),
  };
}
