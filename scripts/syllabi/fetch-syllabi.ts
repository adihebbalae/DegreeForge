#!/usr/bin/env node
/**
 * Public syllabi scraper — UT CourseDocs (HB 2504).
 *
 * Pulls the fully-PUBLIC "Access Syllabi & CVs" search (NO EID / cookie) at
 * https://utdirect.utexas.edu/apps/student/coursedocs/nlogon/ for a department
 * (and optional course-number filter), parses the result rows, downloads the
 * most-recent syllabus PDF per course, extracts text + heuristic fields
 * (grading breakdown, topic schedule, textbooks, description excerpt), and
 * writes packages/client/public/data/syllabi.json keyed by normalized course id
 * (E E → ECE).
 *
 * Usage:
 *   npm run fetch:syllabi -- [options]
 *
 * Options:
 *   --department <id>   CourseDocs dept code (DEFAULT "E E"). Repeatable. The
 *                       app's internal "ECE" is reversed to "E E" automatically
 *                       (CourseDocs uses the spaced code). Quote spaced codes:
 *                       --department "C S"
 *   --course <num>      Restrict to one course number, e.g. 302 or 411. May be
 *                       repeated. When omitted, every course the dept search
 *                       returns is processed.
 *   --max-per-course N  How many recent syllabi to download per course
 *                       (default 1 — one representative most-recent syllabus).
 *   --delay-ms N        Polite delay between network requests (default 1200).
 *   --out <path>        Output JSON path (default packages/client/public/data/
 *                       syllabi.json).
 *   --dry-run           Parse + report counts; do not download PDFs or write.
 *   --help              Show this help.
 *
 * The portal is public — there is no cookie, no secret, nothing masked.
 * Robustness: continue-on-failure per course/PDF with a progress log; aborts
 * gracefully (non-zero) only when a search returns a login/empty page.
 *
 * See scripts/syllabi/README.md for the full request shape + heuristics notes.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  detectNonResultsHtml,
  parseResultRows,
  mostRecentSyllabiByCourse,
  extractSyllabusFields,
  type SyllabusRow,
  type SyllabusFields,
} from './lib/parse-syllabi';
import { pdfToText } from './lib/pdf-text';

// ─── Paths ───────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'packages', 'client', 'public', 'data', 'syllabi.json');

const COURSEDOCS_SEARCH = 'https://utdirect.utexas.edu/apps/student/coursedocs/nlogon/';
const USER_AGENT = 'DegreeForge/1.0 (degreeforge-local-dev) syllabi-pipeline';

// ─── Dept-code reversal (ECE → E E) ──────────────────────────────────────────

/**
 * Reverse the app's internal id back to the CourseDocs dept dropdown code.
 * CourseDocs wants "E E" (a space), not "ECE" — the documented normalization
 * quirk. Any other code passes through unchanged.
 */
export function toCourseDocsDept(dept: string): string {
  return dept.trim().toUpperCase() === 'ECE' ? 'E E' : dept.trim();
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

export const DEFAULT_DEPARTMENT = 'E E';

export interface CliArgs {
  departments: string[];
  courses: string[];
  maxPerCourse: number;
  delayMs: number;
  out: string;
  dryRun: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    departments: [],
    courses: [],
    maxPerCourse: 1,
    delayMs: 1200,
    out: DEFAULT_OUT,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue; // bare separator (npm/tsx passthrough) — ignore
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--department') {
      const v = argv[++i];
      if (v) out.departments.push(v);
    } else if (a === '--course') {
      const v = argv[++i];
      if (v) out.courses.push(v.trim());
    } else if (a === '--max-per-course') {
      out.maxPerCourse = Math.max(1, Number(argv[++i] ?? '1') || 1);
    } else if (a === '--delay-ms') {
      out.delayMs = Math.max(0, Number(argv[++i] ?? '1200') || 0);
    } else if (a === '--out') {
      out.out = argv[++i] ?? DEFAULT_OUT;
    } else if (a.startsWith('--')) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      throw new Error(`Unexpected positional argument: ${a}`);
    }
  }

  if (out.departments.length === 0) out.departments.push(DEFAULT_DEPARTMENT);
  return out;
}

function printHelp(): void {
  console.log(`
DegreeForge — public syllabi scraper (UT CourseDocs / HB 2504)

Usage:
  npm run fetch:syllabi -- [options]

Options:
  --department <id>    CourseDocs dept code (default "E E"). Repeatable.
                       "ECE" is auto-reversed to "E E". Quote spaced codes.
  --course <num>       Restrict to one course number (e.g. 302). Repeatable.
  --max-per-course N   Recent syllabi to keep per course (default 1).
  --delay-ms N         Polite delay between requests (default 1200).
  --out <path>         Output JSON (default packages/client/public/data/syllabi.json).
  --dry-run            Parse + report; download nothing, write nothing.
  --help               Show this message.

Examples:
  npm run fetch:syllabi -- --department "E E" --course 302 --course 411
  npm run fetch:syllabi -- --department "E E"     # all ECE courses
`);
}

// ─── Output schema ───────────────────────────────────────────────────────────

export interface SyllabusEntry extends SyllabusFields {
  course: string;
  title: string;
  term: string;
  instructor: string;
  docId: string;
  pdfUrl: string;
  /** Plain text length — a quick sanity signal that extraction worked. */
  textChars: number;
}

export interface SyllabiFile {
  source: string;
  generated_at: string;
  /** Keyed by normalized course id, e.g. "ECE 302". */
  syllabi: Record<string, SyllabusEntry>;
}

// ─── Network ─────────────────────────────────────────────────────────────────

function buildSearchUrl(department: string, courseNumber: string): string {
  const params = new URLSearchParams({
    year: '',
    semester: '',
    department,
    course_number: courseNumber,
    course_title: '',
    unique: '',
    instructor_first: '',
    instructor_last: '',
    course_type: 'In Residence',
    search: 'Search',
  });
  return `${COURSEDOCS_SEARCH}?${params.toString()}`;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

async function fetchPdf(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const ct = res.headers.get('content-type') ?? '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (!ct.includes('pdf') && buf.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Error(`Expected a PDF, got content-type "${ct}" (${buf.length} bytes)`);
  }
  return buf;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/** Fetch + parse the search results for one (dept, courseNumber) query. */
async function fetchRows(department: string, courseNumber: string): Promise<SyllabusRow[]> {
  const url = buildSearchUrl(department, courseNumber);
  console.log(`  GET ${url}`);
  const html = await fetchHtml(url);

  const reason = detectNonResultsHtml(html);
  if (reason) {
    if (html.includes('results_table')) {
      // Page is a valid results page but had zero data rows — not an error.
      console.log(`  (no rows: ${reason})`);
      return [];
    }
    throw new Error(`CourseDocs returned a non-results page: ${reason}`);
  }
  return parseResultRows(html);
}

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printHelp();
    process.exit(2);
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  console.log('DegreeForge syllabi scraper (public CourseDocs — no cookie)\n');

  // Gather rows across all requested (dept, course) queries.
  const allRows: SyllabusRow[] = [];
  let first = true;
  for (const rawDept of args.departments) {
    const dept = toCourseDocsDept(rawDept);
    const courseFilters = args.courses.length > 0 ? args.courses : [''];
    for (const courseNum of courseFilters) {
      if (!first) await sleep(args.delayMs);
      first = false;
      const label = courseNum ? `${dept} ${courseNum}` : `${dept} (all)`;
      console.log(`Search: ${label}`);
      try {
        const rows = await fetchRows(dept, courseNum);
        console.log(`  -> ${rows.length} result rows`);
        allRows.push(...rows);
      } catch (err) {
        console.error(`  !! search failed: ${err instanceof Error ? err.message : String(err)}`);
        // Abort only when the very first search yields a hard non-results page;
        // otherwise continue so one bad dept/course can't kill the whole run.
        if (allRows.length === 0 && args.departments.length === 1 && courseFilters.length === 1) {
          process.exit(1);
        }
      }
    }
  }

  const byCourse = mostRecentSyllabiByCourse(allRows);
  console.log(`\nCourses with at least one syllabus: ${byCourse.size}`);

  if (args.dryRun) {
    console.log('\n--dry-run: no PDFs downloaded, nothing written.');
    for (const [course, rows] of byCourse) {
      const r = rows[0];
      console.log(`  ${course.padEnd(10)} ${r.term.padEnd(12)} ${r.instructor.slice(0, 28).padEnd(28)} ${r.pdfUrl}`);
    }
    return;
  }

  // Download + extract the most-recent syllabus per course.
  const syllabi: Record<string, SyllabusEntry> = {};
  let downloaded = 0;
  let failed = 0;
  let extractEngine = 'unknown';

  for (const [course, rows] of byCourse) {
    const take = rows.slice(0, args.maxPerCourse);
    let entryWritten = false;
    for (const row of take) {
      if (entryWritten) break; // MVP keeps one representative per course
      if (!row.pdfUrl || !row.docId) continue;
      await sleep(args.delayMs);
      console.log(`Download: ${course} (${row.term}, ${row.instructor || 'unknown'}) ${row.pdfUrl}`);
      try {
        const bytes = await fetchPdf(row.pdfUrl);
        const { text, engine } = await pdfToText(bytes);
        extractEngine = engine;
        const fields = extractSyllabusFields(text);
        if (text.trim().length === 0) {
          console.warn('  (empty text — likely a scanned/image PDF; storing fields anyway)');
        }
        syllabi[course] = {
          course,
          title: row.title,
          term: row.term,
          instructor: row.instructor,
          docId: row.docId,
          pdfUrl: row.pdfUrl,
          textChars: text.length,
          ...fields,
        };
        downloaded++;
        entryWritten = true;
        console.log(
          `  ok: ${text.length} chars | grading=${fields.grading.length} topics=${fields.topics.length} books=${fields.textbooks.length}`
        );
      } catch (err) {
        failed++;
        console.error(`  !! ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  const fileOut: SyllabiFile = {
    source: `coursedocs-public:${args.departments.join('+')}; engine=${extractEngine}`,
    generated_at: new Date().toISOString(),
    syllabi,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(fileOut, null, 2)}\n`, 'utf-8');

  console.log(
    `\nDone. ${downloaded} syllabi extracted, ${failed} failures. Wrote ${path.relative(REPO_ROOT, args.out)}`
  );
}

// Run main only when invoked directly (not when imported by tests).
const isEntryPoint =
  process.argv[1] != null &&
  (process.argv[1].endsWith('fetch-syllabi.ts') || process.argv[1].endsWith('fetch-syllabi.js'));

if (isEntryPoint) {
  main().catch((err) => {
    console.error('\nfetch-syllabi failed:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
