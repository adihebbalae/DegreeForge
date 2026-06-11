#!/usr/bin/env node
/**
 * Section data fetcher — per-term.
 *
 * Usage:
 *   npm run fetch:sections -- <term-slug> [options]
 *
 * Options:
 *   --source <path>     Parse a locally-saved registrar HTML file (may be
 *                       passed multiple times to merge multiple departments)
 *   --from-legacy       Copy fall-2026-sections.json into the per-term layout
 *                       without doing any network or HTML work. Used once
 *                       during the TASK-027 migration.
 *   --department <id>   Department filter for the authenticated/public probe
 *                       (default: "E E" — UT's pre-normalization ECE code)
 *   --dry-run           Print what would be written, without touching disk
 *   --help              Show this help
 *
 * Authenticated fetch (opt-in, user override of no-cookie rule, 2026-06-11):
 *   Set UT_SESSION_COOKIE env var, or write your session cookie to the
 *   gitignored file scripts/sections/.ut-session. The cookie is sent to
 *   utdirect.utexas.edu ONLY, over HTTPS, and is never logged raw.
 *   Cookie value is ALWAYS masked in output (SC=...[redacted]).
 *
 * See scripts/sections/README.md for the full investigation notes and the
 * recommended manual-export workflow.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseTermSlug, type ParsedTerm } from './lib/term-codes';
import { parseRegistrarHtml, detectNonScheduleHtml, type FallSections, type CourseSections } from './lib/parse-html';
import { upsertIndex } from './lib/write-index';

// ─── Session-cookie read (authenticated fetch opt-in) ────────────────────────

const SESSION_FILE = path.resolve(__dirname, '.ut-session');

/**
 * Read the UT session cookie from the environment or the gitignored file.
 * Returns null if neither source is set.
 * NEVER logs the raw value — always mask it before printing.
 */
export function readSessionCookie(): string | null {
  const fromEnv = process.env['UT_SESSION_COOKIE'];
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  if (fs.existsSync(SESSION_FILE)) {
    const val = fs.readFileSync(SESSION_FILE, 'utf-8').trim();
    if (val.length > 0) return val;
  }
  return null;
}

/**
 * Mask a cookie value for safe logging. Shows first 4 chars then [redacted].
 * Never call this on anything that is not a cookie value.
 */
export function maskCookie(cookie: string): string {
  if (cookie.length <= 4) return '[redacted]';
  return `${cookie.slice(0, 4)}...[redacted]`;
}

// ─── Resolve repo paths ──────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DATA = path.join(REPO_ROOT, 'packages', 'client', 'public', 'data');
// During the TASK-027 migration this pointed at fall-2026-sections.json.
// Post-migration the same data lives in fall-2026.json — keep the helper
// pointing at whichever file currently exists, so re-running --from-legacy
// after the migration still works.
const LEGACY_CANDIDATES = [
  path.join(PUBLIC_DATA, 'fall-2026-sections.json'),
  path.join(PUBLIC_DATA, 'fall-2026.json'),
];
const INDEX_FILE = path.join(PUBLIC_DATA, 'sections-index.json');

// ─── CLI argv parsing ────────────────────────────────────────────────────────

interface CliArgs {
  termSlug: string | null;
  sources: string[];
  fromLegacy: boolean;
  department: string;
  dryRun: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    termSlug: null,
    sources: [],
    fromLegacy: false,
    department: 'E E',
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--from-legacy') out.fromLegacy = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--source') out.sources.push(argv[++i] ?? '');
    else if (a === '--department') out.department = argv[++i] ?? out.department;
    else if (a.startsWith('--')) throw new Error(`Unknown flag: ${a}`);
    else if (!out.termSlug) out.termSlug = a;
    else throw new Error(`Unexpected positional argument: ${a} (term slug already set to "${out.termSlug}")`);
  }

  return out;
}

function printHelp(): void {
  console.log(`
DegreeForge — section data fetcher

Usage:
  npm run fetch:sections -- <term-slug> [options]

Term slug:
  <season>-<year>, e.g.  fall-2026  spring-2027  summer-2027

Options:
  --source <path>     Locally-saved registrar HTML file (repeatable)
  --from-legacy       Use existing fall-2026-sections.json (migration helper)
  --department <id>   Department filter for authenticated/public probe (default "E E")
  --dry-run           Print preview, write nothing
  --help              Show this message

Authenticated fetch (opt-in):
  Set UT_SESSION_COOKIE env var, or write your session cookie to the
  gitignored file scripts/sections/.ut-session. When a cookie is present,
  the fetcher sends it to utdirect.utexas.edu and parses the full results.
  Cookie is never logged raw and never committed.

Manual-export fallback (always available):
  1. Log into UT EID in your browser
  2. Open https://utdirect.utexas.edu/apps/registrar/course_schedule/<code>/results/?fos_fl=E+E&level=L&search=Search
  3. Save the page as HTML to scripts/sections/raw/<term-slug>/ece.html
  4. npm run fetch:sections -- <term-slug> --source scripts/sections/raw/<term-slug>/ece.html

See scripts/sections/README.md for the full investigation notes.
`);
}

// ─── Data sources ────────────────────────────────────────────────────────────

function loadLegacySnapshot(term: ParsedTerm): FallSections {
  const file = LEGACY_CANDIDATES.find((p) => fs.existsSync(p));
  if (!file) {
    throw new Error(
      `--from-legacy: no fall-2026 snapshot found at any of: ` +
        LEGACY_CANDIDATES.map((p) => path.relative(REPO_ROOT, p)).join(', ') +
        `. Use --source instead, or pull the file back from git history.`
    );
  }
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as FallSections;
  // Keep the existing source string — it's accurate provenance for this data.
  return {
    semester: term.label,
    semester_code: term.code,
    source: raw.source ?? 'legacy fall-2026-sections.json',
    courses: raw.courses,
  };
}

function loadFromHtmlFiles(sources: string[], term: ParsedTerm): FallSections {
  const merged: FallSections = {
    semester: term.label,
    semester_code: term.code,
    source: `manual export: ${sources.map((s) => path.basename(s)).join(', ')}`,
    courses: {},
  };

  for (const src of sources) {
    if (!fs.existsSync(src)) {
      throw new Error(`--source file not found: ${src}`);
    }
    const html = fs.readFileSync(src, 'utf-8');
    const parsed = parseRegistrarHtml(html, term, src);
    mergeCourses(merged.courses, parsed.courses);
  }

  return merged;
}

function mergeCourses(
  into: Record<string, CourseSections>,
  add: Record<string, CourseSections>
): void {
  for (const [id, c] of Object.entries(add)) {
    if (!into[id]) {
      into[id] = { course: c.course, title: c.title, sections: [] };
    }
    const seen = new Set(into[id].sections.map((s) => s.unique));
    for (const sec of c.sections) {
      if (!seen.has(sec.unique)) {
        into[id].sections.push(sec);
        seen.add(sec.unique);
      }
    }
  }
}

async function probePublicHtml(term: ParsedTerm, department: string): Promise<FallSections> {
  const fos = encodeURIComponent(department);
  const url = `https://utdirect.utexas.edu/apps/registrar/course_schedule/${term.code}/results/?fos_fl=${fos}&level=L&search=Search`;
  console.log(`Probing public registrar page: ${url}`);

  let html: string;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'DegreeForge/1.0 (https://github.com/) section-pipeline' },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    html = await res.text();
  } catch (err) {
    throw new Error(
      `Public-HTML probe failed (${err instanceof Error ? err.message : String(err)}). ` +
        `Use --source with a manually saved HTML file. See scripts/sections/README.md.`
    );
  }

  const reason = detectNonScheduleHtml(html);
  if (reason) {
    throw new Error(
      `Public-HTML probe returned non-schedule content: ${reason}\n` +
        `This is expected for most filters — use --source with a manually saved HTML file. ` +
        `See scripts/sections/README.md.`
    );
  }

  return parseRegistrarHtml(html, term, url);
}

/**
 * Authenticated fetch using the user's UT session cookie.
 *
 * This is the TASK-053 opt-in path. The user has explicitly overridden the
 * prior no-cookie-scraping rule (2026-06-11). The cookie is:
 *   - read from env var UT_SESSION_COOKIE or gitignored file .ut-session
 *   - sent ONLY to utdirect.utexas.edu over HTTPS
 *   - never logged raw (masked in all output)
 *   - never hardcoded or committed
 *
 * On auth failure (CAS redirect or no Unique cells) → aborts with re-paste
 * guidance. Requests are sequential with a polite delay between terms.
 */
export async function fetchWithCookie(
  term: ParsedTerm,
  department: string,
  cookie: string,
  fetchFn: typeof fetch = fetch
): Promise<FallSections> {
  const fos = encodeURIComponent(department);
  const url = `https://utdirect.utexas.edu/apps/registrar/course_schedule/${term.code}/results/?fos_fl=${fos}&level=L&search=Search`;

  // Safety: only ever send the cookie to utexas.edu
  const urlObj = new URL(url);
  if (!urlObj.hostname.endsWith('.utexas.edu')) {
    throw new Error(`Refusing to send cookie to non-utexas.edu host: ${urlObj.hostname}`);
  }

  console.log(`Authenticated fetch: ${url}`);
  console.log(`  Cookie: ${maskCookie(cookie)}`);

  let html: string;
  try {
    const res = await fetchFn(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'DegreeForge/1.0 (degreeforge-local-dev) section-pipeline',
        'Cookie': cookie,
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    html = await res.text();
  } catch (err) {
    throw new Error(
      `Authenticated fetch failed (${err instanceof Error ? err.message : String(err)}). ` +
        `Check your internet connection and try again.`
    );
  }

  const reason = detectNonScheduleHtml(html);
  if (reason) {
    // Auth failure — CAS redirect or empty results
    throw new AuthFailureError(
      `Authenticated fetch got non-schedule content: ${reason}\n` +
        `Your session cookie has likely expired. Re-paste a fresh cookie:\n` +
        `  1. Log into UT EID in your browser\n` +
        `  2. Copy the Cookie header from DevTools Network tab (utdirect.utexas.edu)\n` +
        `  3. Set UT_SESSION_COOKIE=<value> or write to scripts/sections/.ut-session\n` +
        `  4. Re-run: npm run fetch:sections -- ${term.slug}`
    );
  }

  return parseRegistrarHtml(html, term, `authenticated-fetch:${url}`);
}

/** Thrown when the registrar responds with a CAS redirect or no Unique cells. */
export class AuthFailureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthFailureError';
  }
}

// ─── Output ──────────────────────────────────────────────────────────────────

function summarize(data: FallSections): string {
  const courseCount = Object.keys(data.courses).length;
  const sectionCount = Object.values(data.courses).reduce(
    (sum, c) => sum + c.sections.length,
    0
  );
  return `${courseCount} courses, ${sectionCount} sections`;
}

function writeOutput(term: ParsedTerm, data: FallSections): { outFile: string; indexFile: string } {
  const fileName = `${term.slug}.json`;
  const outFile = path.join(PUBLIC_DATA, fileName);

  fs.mkdirSync(PUBLIC_DATA, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(data, null, 2), 'utf-8');
  upsertIndex(INDEX_FILE, term, fileName);

  return { outFile, indexFile: INDEX_FILE };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printHelp();
    process.exit(2);
  }

  if (args.help || !args.termSlug) {
    printHelp();
    process.exit(args.help ? 0 : 2);
  }

  const term = parseTermSlug(args.termSlug);
  console.log(`Term: ${term.label} (slug=${term.slug}, code=${term.code})`);

  let data: FallSections;
  if (args.fromLegacy) {
    console.log('Mode: --from-legacy (copying existing fall-2026-sections.json snapshot)');
    data = loadLegacySnapshot(term);
  } else if (args.sources.length > 0) {
    console.log(`Mode: --source (parsing ${args.sources.length} HTML file(s))`);
    data = loadFromHtmlFiles(args.sources, term);
  } else {
    const cookie = readSessionCookie();
    if (cookie) {
      console.log(`Mode: authenticated fetch (UT session cookie present, ${maskCookie(cookie)})`);
      data = await fetchWithCookie(term, args.department, cookie);
    } else {
      console.log(`Mode: public-HTML probe (no session cookie — department="${args.department}")`);
      console.log(`Tip: set UT_SESSION_COOKIE or write to scripts/sections/.ut-session for authenticated fetch.`);
      data = await probePublicHtml(term, args.department);
    }
  }

  console.log(`Parsed: ${summarize(data)}`);

  if (args.dryRun) {
    console.log('\n--dry-run: no files written.');
    console.log(`Would write: packages/client/public/data/${term.slug}.json`);
    console.log(`Would update: packages/client/public/data/sections-index.json`);
    return;
  }

  const { outFile, indexFile } = writeOutput(term, data);
  console.log(`✅ Wrote   ${path.relative(REPO_ROOT, outFile)}`);
  console.log(`✅ Updated ${path.relative(REPO_ROOT, indexFile)}`);
}

// Run main only when invoked directly (not when imported by tests)
const isEntryPoint =
  process.argv[1] &&
  (process.argv[1].endsWith('fetch-term.ts') || process.argv[1].endsWith('fetch-term.js'));

if (isEntryPoint) {
  main().catch((err) => {
    console.error('\nfetch-term failed:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
