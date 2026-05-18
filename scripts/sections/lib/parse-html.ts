/**
 * Parse UT registrar course-schedule HTML into the existing FallSections
 * schema. Uses cheerio for DOM traversal — no headless browser, no JS exec.
 *
 * Target structure: each course on the registrar results page appears as a
 * <table> (or grouped <tr> block) whose rows include labeled cells like
 *   <td>Unique:</td><td>18310</td>
 *   <td>Days:</td><td>MW</td>
 *   <td>Hour:</td><td>9:00 a.m.-10:30 a.m.</td>
 *   <td>Room:</td><td>EER 1.516</td>
 *   <td>Instructor:</td><td>Shankar, S</td>
 *
 * The exact wrapping markup has changed multiple times in the past five
 * years, so this parser intentionally scans all <td> / <th> cells with
 * label-suffix matching ("Unique:", "Days:", etc.) and re-assembles records
 * keyed off `Unique:` cells. This is more forgiving than xpath against any
 * single layout revision.
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
 * results page, (c) something completely unrelated?
 *
 * Returns null when the HTML looks parseable; otherwise a human-readable
 * reason the caller should surface and abort.
 */
export function detectNonScheduleHtml(html: string): string | null {
  const head = html.slice(0, 4000).toLowerCase();
  if (head.includes('ut eid login') || head.includes('utlogin')) {
    return 'Page is the UT EID login redirect. Log in to UT in your browser, save the results page, and pass it with --source.';
  }
  if (!html.toLowerCase().includes('unique:')) {
    return 'No "Unique:" labels found in the HTML. Either the page is empty or UT has changed the schedule layout.';
  }
  return null;
}

// ─── Cell-pair extraction ────────────────────────────────────────────────────

/**
 * Walk the DOM in document order and yield (label, value) pairs, where label
 * is the text of a cell ending in ":" and value is the text of the very next
 * sibling-or-descendant text cell.
 *
 * Course-header rows (e.g. "ECE 302 INTRO ELECTRICAL ENGINEERING") are
 * surfaced as a synthetic label "__course__" so the caller can use them as
 * section-group anchors.
 */
interface LabelledPair {
  label: string;
  value: string;
}

const LABEL_PATTERN = /^(Unique|Days|Hour|Room|Instruction Mode|Instructor|Status|Core|Flags):\s*$/i;

const COURSE_HEADER_PATTERN = /^((?:ECE|E\s*E|M)\s+\d+\w?(?:H)?)\s+(.+?)$/;

function extractPairs(html: string): LabelledPair[] {
  const $ = cheerio.load(html);

  // Registrar pages are table-based: each row contributes one or two text
  // cells (a label cell ending in ":" and a value cell, or a single header
  // cell like "ECE 302 INTRO ELECTRICAL ENGINEERING"). Collecting `td,th`
  // text via `.text()` is the most layout-stable signal — it survives nested
  // <b>, <a>, <span> wrappers.
  const cells: string[] = [];
  $('td, th').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > 0 && text.length < 400) {
      cells.push(text);
    }
  });

  const pairs: LabelledPair[] = [];
  for (let i = 0; i < cells.length; i++) {
    const t = cells[i];

    // Course header (no label): "ECE 302 INTRO ELECTRICAL ENGINEERING"
    const courseHit = COURSE_HEADER_PATTERN.exec(t);
    if (courseHit) {
      pairs.push({
        label: '__course__',
        value: `${courseHit[1].replace(/\s+/g, ' ').replace(/^E\s*E\s/i, 'ECE ')} ${courseHit[2].trim()}`,
      });
      continue;
    }

    // Labeled pair: "Unique:" cell followed by its value cell
    const labelHit = LABEL_PATTERN.exec(t);
    if (labelHit && i + 1 < cells.length) {
      const valueText = cells[i + 1];
      if (!LABEL_PATTERN.test(valueText) && !COURSE_HEADER_PATTERN.test(valueText)) {
        pairs.push({ label: labelHit[1].trim(), value: valueText });
        i++; // consume the value cell
      }
    }
  }

  return pairs;
}

// ─── Pair-stream → FallSections assembly ─────────────────────────────────────

function blankSection(unique: number): CourseSection {
  return {
    unique,
    meetings: [],
    instruction_mode: '',
    instructor: '',
    status: '',
    core: '',
  };
}

function pushMeeting(
  section: CourseSection,
  field: 'days' | 'time' | 'room',
  value: string
): void {
  // Each new "Days:" / "Hour:" / "Room:" starts a fresh meeting slot if the
  // current one already has that field. Otherwise fill in the open slot.
  const last = section.meetings[section.meetings.length - 1];
  const target =
    !last || (field === 'days' && last.days) || (field === 'time' && last.time) || (field === 'room' && last.room)
      ? (section.meetings[section.meetings.push({ time: '' }) - 1] as SectionMeeting)
      : last;
  if (field === 'days') target.days = value;
  if (field === 'time') target.time = value;
  if (field === 'room') target.room = value;
}

export function parseRegistrarHtml(html: string, term: ParsedTerm, sourceLabel: string): FallSections {
  const reason = detectNonScheduleHtml(html);
  if (reason) {
    throw new Error(`Cannot parse HTML: ${reason}`);
  }

  const pairs = extractPairs(html);

  const out: FallSections = {
    semester: term.label,
    semester_code: term.code,
    source: sourceLabel,
    courses: {},
  };

  let currentCourse: CourseSections | null = null;
  let currentSection: CourseSection | null = null;

  const commitSection = () => {
    if (currentCourse && currentSection) {
      // Drop empty placeholder meetings the assembler may have created
      currentSection.meetings = currentSection.meetings.filter(
        (m) => m.time || m.days || m.room
      );
      currentCourse.sections.push(currentSection);
    }
    currentSection = null;
  };

  for (const { label, value } of pairs) {
    if (label === '__course__') {
      commitSection();
      const headerMatch = /^(\S+\s+\S+)\s+(.+)$/.exec(value);
      if (!headerMatch) continue;
      const courseId = headerMatch[1];
      const title = headerMatch[2];
      if (!out.courses[courseId]) {
        out.courses[courseId] = { course: courseId, title, sections: [] };
      }
      currentCourse = out.courses[courseId];
      continue;
    }

    if (!currentCourse) continue;

    if (label === 'Unique') {
      commitSection();
      const n = Number(value.replace(/\D/g, ''));
      if (Number.isFinite(n) && n > 0) {
        currentSection = blankSection(n);
      }
      continue;
    }

    if (!currentSection) continue;

    switch (label) {
      case 'Days':
        pushMeeting(currentSection, 'days', value);
        break;
      case 'Hour':
        pushMeeting(currentSection, 'time', value);
        break;
      case 'Room':
        pushMeeting(currentSection, 'room', value);
        break;
      case 'Instruction Mode':
        currentSection.instruction_mode = value;
        break;
      case 'Instructor':
        currentSection.instructor = value;
        break;
      case 'Status':
        currentSection.status = value.toLowerCase();
        break;
      case 'Core':
      case 'Flags':
        currentSection.core = value;
        break;
    }
  }

  commitSection();

  // Drop courses that ended up with zero sections (parser noise)
  for (const [id, c] of Object.entries(out.courses)) {
    if (c.sections.length === 0) delete out.courses[id];
  }

  return out;
}
