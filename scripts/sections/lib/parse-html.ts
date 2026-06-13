/**
 * Parse UT registrar course-schedule HTML into the existing FallSections
 * schema. Uses cheerio for DOM traversal — no headless browser, no JS exec.
 *
 * Real page layout (verified against live fall-2026 samples):
 *
 *   <table class="rwd-table results">
 *     <thead>
 *       <tr>
 *         <th>Unique</th><th>Day</th><th>Hour</th><th>Room</th>
 *         <th>Instruction Mode</th><th>Instructor</th><th>Status</th>
 *         <th></th><th>Core</th>
 *       </tr>
 *     </thead>
 *     <tbody>
 *       <!-- Course header row -->
 *       <tr>
 *         <td class="course_header" colspan="8"><h2>ECE  422C SOFTWR DESIGN/IMPLEMENTATN II</h2></td>
 *       </tr>
 *       <!-- Section row (one per unique number) -->
 *       <tr>
 *         <td data-th="Unique"><a href="..." title="Unique number">18685</a></td>
 *         <td data-th="Days"><span>TTH</span><br><span class="second-row">TH</span><br></td>
 *         <td data-th="Hour"><span>12:30 p.m.-2:00 p.m.</span><br><span class="second-row">11:00 a.m.-12:30 p.m.</span><br></td>
 *         <td data-th="Room"><span>EER 1.516</span><br><span class="second-row">EER 0.818</span><br></td>
 *         <td data-th="Instruction Mode">Face-to-face</td>
 *         <td data-th="Instructor"><span>THOMAZ, EDISON JR</span><br></td>
 *         <td data-th="Status">waitlisted</td>
 *         <td data-th="Add">...</td>
 *         <td data-th="Core"><div class="core_block"><ul class="core"><li class="C1" ...>Communication</li></ul></div></td>
 *       </tr>
 *     </tbody>
 *   </table>
 *
 * Multi-meeting sections: the Days/Hour/Room cells each contain multiple
 * <span> children (one per meeting slot). Slots are paired by index.
 */

import * as cheerio from 'cheerio';
import type { ParsedTerm } from './term-codes';

export interface SectionMeeting {
  days?: string;
  time: string;
  room?: string;
}

export interface CourseSection {
  unique: number;
  meetings: SectionMeeting[];
  instruction_mode: string;
  instructor: string;
  status: string;
  core: string;
}

export interface CourseSections {
  course: string;
  title: string;
  sections: CourseSection[];
}

export interface FallSections {
  semester: string;
  semester_code: string;
  source: string;
  courses: Record<string, CourseSections>;
}

// ─── Heuristic gate ──────────────────────────────────────────────────────────

/**
 * Cheap check before parsing: does this HTML look like a registrar schedule
 * results page at all, or is it (a) an EID login redirect, (b) an empty
 * search form with no result rows?
 *
 * Returns null when the HTML looks parseable; otherwise a human-readable
 * reason the caller should surface and abort.
 *
 * Detection strategy for genuine results vs empty form:
 *   - Login: page title / body contains "ut eid login" or "utlogin"
 *   - Empty form (no search submitted yet): has <select name="fos_fl"> but
 *     NO <a title="Unique number"> links — the form page returns course data
 *     only after a query is submitted with search_type_main=FIELD
 *   - Valid results: contains at least one <a title="Unique number"> link
 */
export function detectNonScheduleHtml(html: string): string | null {
  const head = html.slice(0, 4000).toLowerCase();
  if (head.includes('ut eid login') || head.includes('utlogin')) {
    return 'Page is the UT EID login redirect. Log in to UT in your browser, save the results page, and pass it with --source.';
  }
  if (!html.includes('title="Unique number"')) {
    return 'No sections found in the HTML. Either the page is the empty search form (missing search_type_main=FIELD), the query returned no results, or UT has changed the schedule layout.';
  }
  return null;
}

// ─── Course-id normalization ─────────────────────────────────────────────────

/**
 * Normalize the raw course-id token extracted from the page.
 * The registrar uses "E E" (with a space) for ECE; real pages now show "ECE"
 * but old fixtures and "E E" dept codes must still be accepted.
 * Also collapses multiple internal spaces (e.g. "ECE  422C" → "ECE 422C").
 */
function normalizeCourseId(raw: string): string {
  return raw
    .replace(/^E\s+E\s+/i, 'ECE ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Strip a leading lowercase session letter from a summer course number token.
 * Summer headers look like "ECE w422C" or "ECE n333T" where a single lowercase
 * letter (w=whole, n=nine-week, f=first, s=second session) prefixes the
 * numeric course number. UT course numbers are digits + optional UPPERCASE
 * suffix, so a lowercase prefix is always a session code, never part of the
 * course number itself.
 *
 * Examples:
 *   "w422C" → "422C"
 *   "n333T" → "333T"
 *   "422C"  → "422C"  (unchanged — no session prefix)
 */
function stripSessionPrefix(numberToken: string): string {
  return numberToken.replace(/^[a-z](\d)/, '$1');
}

// ─── Row-based parser ────────────────────────────────────────────────────────

/**
 * Extract the text of each <span> child of a cell, filtering empty strings.
 * Used for Days / Hour / Room cells that contain one span per meeting slot.
 */
function spanTexts($: cheerio.CheerioAPI, cell: cheerio.Element): string[] {
  return $(cell)
    .find('span')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((t) => t.length > 0);
}

export function parseRegistrarHtml(html: string, term: ParsedTerm, sourceLabel: string): FallSections {
  const reason = detectNonScheduleHtml(html);
  if (reason) {
    throw new Error(`Cannot parse HTML: ${reason}`);
  }

  const $ = cheerio.load(html);

  const out: FallSections = {
    semester: term.label,
    semester_code: term.code,
    source: sourceLabel,
    courses: {},
  };

  let currentCourse: CourseSections | null = null;

  // Process every <tr> inside the results table body.
  // The table may not exist in fixture HTML that uses the old label-pair
  // format, so we fall back to scanning all <tr> in the document.
  const rows = $('table.results tbody tr, table tbody tr').toArray();

  for (const row of rows) {
    const $row = $(row);

    // ── Course header row ────────────────────────────────────────────────────
    const headerCell = $row.find('td.course_header h2');
    if (headerCell.length > 0) {
      const raw = headerCell.text().replace(/\s+/g, ' ').trim();
      // Format: "ECE  422C SOFTWR DESIGN/IMPLEMENTATN II" (after space-collapse: "ECE 422C TITLE")
      // Also handles multi-token spaced dept codes: "E E 302 TITLE", "C S 314 TITLE",
      // "T D 301 TITLE", "F A 320K TITLE" — the dept may be one OR several
      // whitespace-separated alpha tokens.
      // Summer format: "ECE w422C TITLE (Whole term)" — lowercase session letter
      // prefixes the number; strip it before storing the course id.
      //
      // The course NUMBER token is the reliable anchor: optional lowercase
      // summer-session letter, then digits, then an UPPERCASE suffix
      // (e.g. "422C", "408C", "w422C"). Everything BEFORE that number token is
      // the department code; collapse its internal whitespace into single
      // spaces. This avoids special-casing each spaced dept code.
      // Pattern: (dept = one-or-more alpha tokens) (session-letter? num) TITLE
      const m = /^([A-Za-z]+(?:\s+[A-Za-z]+)*)\s+([a-z]?\d+[A-Z]*)\s+(.+)$/.exec(raw);
      if (m) {
        const dept = m[1].replace(/\s+/g, ' ').trim();
        const numToken = stripSessionPrefix(m[2]);
        const courseId = normalizeCourseId(`${dept} ${numToken}`);
        // Strip session suffix from title (e.g. " (Whole term)", " (Nine week term)")
        const title = m[3].replace(/\s*\([^)]*term\)\s*$/i, '').trim();
        if (!out.courses[courseId]) {
          out.courses[courseId] = { course: courseId, title, sections: [] };
        }
        currentCourse = out.courses[courseId];
      }
      continue;
    }

    if (!currentCourse) continue;

    // ── Section row ──────────────────────────────────────────────────────────
    // Unique number: <td data-th="Unique"><a title="Unique number">18685</a></td>
    const uniqueAnchor = $row.find('a[title="Unique number"]');
    if (uniqueAnchor.length === 0) continue;

    const uniqueNum = Number(uniqueAnchor.text().trim());
    if (!Number.isFinite(uniqueNum) || uniqueNum <= 0) continue;

    // Days / Hour / Room: each cell may have multiple <span> children,
    // one per meeting slot. Pair them by index.
    const daysCell = $row.find('td[data-th="Days"]');
    const hourCell = $row.find('td[data-th="Hour"]');
    const roomCell = $row.find('td[data-th="Room"]');

    const daysList = spanTexts($, daysCell[0]);
    const hourList = spanTexts($, hourCell[0]);
    const roomList = spanTexts($, roomCell[0]);

    const slotCount = Math.max(daysList.length, hourList.length, roomList.length);
    const meetings: SectionMeeting[] = [];

    if (slotCount === 0) {
      // Section with no scheduled meeting (e.g. correspondence / independent)
      // — emit a placeholder meeting with empty time so schema is intact.
    } else {
      for (let i = 0; i < slotCount; i++) {
        const time = hourList[i] ?? '';
        const days = daysList[i];
        const room = roomList[i];
        const meeting: SectionMeeting = { time };
        if (days) meeting.days = days;
        if (room) meeting.room = room;
        meetings.push(meeting);
      }
    }

    // Instruction Mode
    const instrMode = $row.find('td[data-th="Instruction Mode"]').text().trim();

    // Instructor: may have multiple spans; join with ", "
    const instructorSpans = $row.find('td[data-th="Instructor"] span');
    const instructor = instructorSpans.length > 0
      ? instructorSpans.map((_, el) => $(el).text().trim()).get().filter(Boolean).join(', ')
      : $row.find('td[data-th="Instructor"]').text().trim();

    // Status
    const status = $row.find('td[data-th="Status"]').text().trim().toLowerCase();

    // Core: text content of <li> elements inside core_block
    const coreItems = $row.find('td[data-th="Core"] .core li');
    const core = coreItems.length > 0
      ? coreItems.map((_, el) => $(el).text().trim()).get().filter(Boolean).join('; ')
      : '';

    const section: CourseSection = {
      unique: uniqueNum,
      meetings,
      instruction_mode: instrMode,
      instructor,
      status,
      core,
    };

    currentCourse.sections.push(section);
  }

  // Drop courses that ended up with zero sections (parser noise)
  for (const [id, c] of Object.entries(out.courses)) {
    if (c.sections.length === 0) delete out.courses[id];
  }

  return out;
}
