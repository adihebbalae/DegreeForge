#!/usr/bin/env node
/**
 * scrape-audit — deterministic post-scrape sanity check (TASK-067).
 *
 * Usage:
 *   npm run scrape:audit
 *
 * Reads the per-term section files listed in sections-index.json (plus the
 * aggregated offering-schedule.json if present) and runs a fixed set of
 * structural checks over them. Exits NON-ZERO if any check FAILs, so it can
 * gate a re-scrape in CI or a manual pipeline run.
 *
 * Why this exists: the first multi-department scrape produced near-empty term
 * files (spaced-dept parser bug + overwrite-on-write bug). Both were silent —
 * the pipeline reported "success" with 0 real data. These checks turn those
 * silent failures into a loud non-zero exit.
 *
 * Checks:
 *   1. zero-count   — a dept at 0 courses in a term while it has courses in
 *                     another term → FAIL (catches the spaced-dept / overwrite
 *                     bugs). An allowlist exempts genuinely-empty (dept,term)
 *                     pairs (e.g. summer fine-arts).
 *   2. cross-term   — a dept's per-term course count deviating > 40% from its
 *                     across-term median → WARN (seasonal variation is normal).
 *   3. sections>=courses — every term must have at least as many sections as
 *                     courses (a course with 0 sections is dropped by the
 *                     parser, so sections < courses signals corruption) → FAIL.
 *   4. anchors      — a known set of courses must exist somewhere in the corpus
 *                     (ECE 302, M 408C, C S 314, PHY 303K, HIS 315K). A missing
 *                     anchor catches a silent dept rename the instant it lands.
 *                     → FAIL.
 *
 * The audit operates on data the scraper produced — it does NOT hit the network.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { FallSections } from './lib/parse-html';

// ─── Types ────────────────────────────────────────────────────────────────────

export type Severity = 'FAIL' | 'WARN';

export interface AuditFinding {
  check: string;
  severity: Severity;
  message: string;
}

export interface AuditResult {
  findings: AuditFinding[];
  ok: boolean; // true when there are zero FAIL findings
}

/** A term file keyed by slug, as the audit consumes them. */
export interface TermInput {
  slug: string;
  data: FallSections;
}

// ─── Tunables ─────────────────────────────────────────────────────────────────

/**
 * Courses that MUST exist somewhere in the scraped corpus. Each is a load-
 * bearing anchor for a different department; a missing one means that dept
 * scraped empty (or was renamed at the registrar). Course ids use the UT
 * spaced-code convention ("C S 314", not "CS 314").
 */
export const ANCHOR_COURSES = [
  'ECE 302',
  'M 408C',
  'C S 314',
  'PHY 303K',
  'HIS 315K',
] as const;

/**
 * (dept, term-slug) pairs that are legitimately empty and must NOT trip the
 * zero-count FAIL. Keep this list tiny and documented — every entry is a known
 * registrar fact, not a workaround for a scraper bug.
 *   - "F A" / "T D" in summer: UT fine-arts & theatre-dance rarely offer
 *     summer sections, so a 0 there is expected, not a parser failure.
 */
export const ZERO_COUNT_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  // format: `${dept}@${slug}`
  // (left empty until a real empty pair is observed; documented examples below)
  // 'F A@summer-2026',
  // 'T D@summer-2026',
]);

/** Cross-term deviation threshold (fraction of median) before a WARN. */
export const CROSS_TERM_DEVIATION = 0.4;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Department code for a course id. UT ids put the dept first and the number
 * last ("ECE 302", "C S 314", "F A 320K"); the number is always the final
 * whitespace-separated token, so the dept is everything before it.
 */
export function deptOf(courseId: string): string {
  const idx = courseId.lastIndexOf(' ');
  return idx === -1 ? courseId : courseId.slice(0, idx);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Course + section counts per dept for a single term. */
function deptCounts(data: FallSections): Map<string, { courses: number; sections: number }> {
  const counts = new Map<string, { courses: number; sections: number }>();
  for (const [id, c] of Object.entries(data.courses)) {
    const dept = deptOf(id);
    const entry = counts.get(dept) ?? { courses: 0, sections: 0 };
    entry.courses += 1;
    entry.sections += c.sections.length;
    counts.set(dept, entry);
  }
  return counts;
}

// ─── Core audit (pure — unit-testable) ────────────────────────────────────────

export function auditTerms(terms: TermInput[]): AuditResult {
  const findings: AuditFinding[] = [];

  // Per-term dept counts, plus the full set of depts seen anywhere.
  const perTerm = terms.map((t) => ({ slug: t.slug, counts: deptCounts(t.data) }));
  const allDepts = new Set<string>();
  for (const t of perTerm) {
    for (const dept of t.counts.keys()) allDepts.add(dept);
  }

  // ── Check 1: zero-count ────────────────────────────────────────────────────
  // A dept present in SOME term but at 0 in another (and not allowlisted) is a
  // FAIL — that is exactly the spaced-dept / overwrite failure mode.
  for (const dept of allDepts) {
    for (const t of perTerm) {
      const n = t.counts.get(dept)?.courses ?? 0;
      if (n === 0 && !ZERO_COUNT_ALLOWLIST.has(`${dept}@${t.slug}`)) {
        findings.push({
          check: 'zero-count',
          severity: 'FAIL',
          message: `Dept "${dept}" has 0 courses in ${t.slug} but appears in other terms. Likely a parser/merge failure (or add to ZERO_COUNT_ALLOWLIST if genuinely empty).`,
        });
      }
    }
  }

  // ── Check 2: cross-term deviation ──────────────────────────────────────────
  // WARN (not FAIL) — seasonal offerings legitimately vary.
  for (const dept of allDepts) {
    const series = perTerm.map((t) => t.counts.get(dept)?.courses ?? 0);
    const med = median(series.filter((n) => n > 0));
    if (med === 0) continue;
    for (let i = 0; i < perTerm.length; i++) {
      const n = series[i];
      if (n === 0) continue; // zero-count check owns the 0 case
      const deviation = Math.abs(n - med) / med;
      if (deviation > CROSS_TERM_DEVIATION) {
        findings.push({
          check: 'cross-term',
          severity: 'WARN',
          message: `Dept "${dept}" has ${n} courses in ${perTerm[i].slug} vs median ${med} across terms (${Math.round(deviation * 100)}% deviation).`,
        });
      }
    }
  }

  // ── Check 3: sections >= courses ───────────────────────────────────────────
  for (const t of perTerm) {
    let courses = 0;
    let sections = 0;
    for (const entry of t.counts.values()) {
      courses += entry.courses;
      sections += entry.sections;
    }
    if (courses > 0 && sections < courses) {
      findings.push({
        check: 'sections>=courses',
        severity: 'FAIL',
        message: `${t.slug} has ${sections} sections but ${courses} courses — every course should have >= 1 section. Data is corrupt.`,
      });
    }
  }

  // ── Check 4: anchor courses present somewhere in the corpus ────────────────
  const allCourseIds = new Set<string>();
  for (const t of terms) {
    for (const id of Object.keys(t.data.courses)) allCourseIds.add(id);
  }
  for (const anchor of ANCHOR_COURSES) {
    if (!allCourseIds.has(anchor)) {
      findings.push({
        check: 'anchors',
        severity: 'FAIL',
        message: `Anchor course "${anchor}" is missing from the entire corpus. Its department scraped empty or was renamed at the registrar.`,
      });
    }
  }

  return { findings, ok: !findings.some((f) => f.severity === 'FAIL') };
}

// ─── Reporting ────────────────────────────────────────────────────────────────

export function formatReport(result: AuditResult): string {
  const lines: string[] = [];
  const fails = result.findings.filter((f) => f.severity === 'FAIL');
  const warns = result.findings.filter((f) => f.severity === 'WARN');

  lines.push('── scrape-audit ──────────────────────────────────────────────');
  if (result.findings.length === 0) {
    lines.push('PASS — all checks clean.');
    return lines.join('\n');
  }
  for (const f of fails) lines.push(`FAIL [${f.check}] ${f.message}`);
  for (const f of warns) lines.push(`WARN [${f.check}] ${f.message}`);
  lines.push('──────────────────────────────────────────────────────────────');
  lines.push(`${fails.length} FAIL, ${warns.length} WARN`);
  return lines.join('\n');
}

// ─── Disk loading (impure shell) ──────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DATA = path.join(REPO_ROOT, 'packages', 'client', 'public', 'data');
const INDEX_FILE = path.join(PUBLIC_DATA, 'sections-index.json');

interface SectionsIndex {
  default_term?: string;
  terms: Array<{ slug: string; label: string; code: string; file: string }>;
}

export function loadTermsFromDisk(dataDir: string = PUBLIC_DATA, indexFile: string = INDEX_FILE): TermInput[] {
  if (!fs.existsSync(indexFile)) {
    throw new Error(`sections-index.json not found at ${indexFile}. Run a scrape first.`);
  }
  const index = JSON.parse(fs.readFileSync(indexFile, 'utf-8')) as SectionsIndex;
  const terms: TermInput[] = [];
  for (const t of index.terms) {
    const file = path.join(dataDir, t.file);
    if (!fs.existsSync(file)) {
      throw new Error(`Term file listed in index but missing on disk: ${t.file}`);
    }
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as FallSections;
    terms.push({ slug: t.slug, data });
  }
  return terms;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main(): void {
  let terms: TermInput[];
  try {
    terms = loadTermsFromDisk();
  } catch (err) {
    console.error(`scrape-audit: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }

  const result = auditTerms(terms);
  console.log(formatReport(result));
  process.exit(result.ok ? 0 : 1);
}

const isEntryPoint =
  process.argv[1] &&
  (process.argv[1].endsWith('scrape-audit.ts') || process.argv[1].endsWith('scrape-audit.js'));

if (isEntryPoint) {
  main();
}
