/**
 * catalog-transform.ts — pure transform logic for build-catalog.ts (TASK-catalog)
 *
 * The dedup / merge / core-label-mapping logic lives here, decoupled from file
 * I/O, so it is unit-testable in isolation (catalog-transform.test.ts) and the
 * driver script (build-catalog.ts) stays a thin read → transform → write shell.
 *
 * INVARIANTS this module enforces (see TASK-catalog brief):
 *   1. Existing catalog entries are NEVER mutated — `mergeCatalog` copies them
 *      verbatim and only ADDS entries for ids not already present.
 *   2. New entries carry EMPTY prerequisites/corequisites. We never parse the
 *      scraped prereq TEXT into the solver — those new courses must not become
 *      prereq-graph nodes. They are additive, prereq-free catalog rows.
 *
 * Pure TypeScript — no fs, no network, no React.
 */

import type { CatalogCourse, CourseCatalog, CoreCategory } from '../../packages/client/src/types';

// ─── Source row shape (one per SECTION in ut-courses.json) ──────────────────────

/**
 * A single section row from the UT course feed. Only the fields the transform
 * consumes are typed; the feed carries many more (instructors, schedule, url,
 * semester, scrapedAt, …) which we deliberately drop — catalog rows are course-
 * level, not section-level.
 */
export interface UtCourseRow {
  fullName?: string;
  courseName?: string;
  department?: string;
  number?: string;
  creditHours?: number | null;
  /** UT core-curriculum labels, e.g. ["Visual and Performing Arts"]. */
  core?: string[];
  /** Description lines: a mix of the human blurb + metadata (prereq, restrictions, grading basis, …). */
  description?: string[];
}

// ─── Core-label → CoreCategory mapping (single source of truth) ─────────────────

/**
 * Maps UT's verbose core-curriculum labels to our clean CoreCategory enum.
 * The two Natural Science labels collapse to one bucket; everything else is 1:1.
 * A label not in this map is ignored (we never invent a category).
 */
export const CORE_LABEL_MAP: Readonly<Record<string, CoreCategory>> = {
  'Visual and Performing Arts': 'vapa',
  'Social and Behavioral Sciences': 'sbs',
  'U.S. History': 'his',
  'American and Texas Government': 'gov',
  'First-Year Signature Course': 'ugs',
  Humanities: 'humanities',
  Communication: 'communication',
  'Natural Science and Technology, Part I': 'natural_science',
  'Natural Science and Technology, Part II': 'natural_science',
  Mathematics: 'math',
};

/** Deterministic display/storage order for a course's CoreCategory set. */
const CORE_ORDER: readonly CoreCategory[] = [
  'vapa',
  'sbs',
  'his',
  'gov',
  'ugs',
  'humanities',
  'communication',
  'natural_science',
  'math',
];

/**
 * Map a union of raw UT core labels to a sorted, deduped CoreCategory[].
 * Returns undefined when no recognized label is present (so the field is
 * simply absent on non-core courses rather than an empty array).
 */
export function mapCoreLabels(labels: readonly string[] | undefined): CoreCategory[] | undefined {
  if (!labels || labels.length === 0) return undefined;
  const set = new Set<CoreCategory>();
  for (const label of labels) {
    const cat = CORE_LABEL_MAP[label];
    if (cat) set.add(cat);
  }
  if (set.size === 0) return undefined;
  return CORE_ORDER.filter((c) => set.has(c));
}

// ─── Course id ──────────────────────────────────────────────────────────────────

/**
 * Build the canonical course id "<department> <number>" from a row, applying
 * the project-wide `E E` → `ECE` normalization. Returns null for malformed
 * rows (missing department or number) — the caller skips those.
 */
export function courseIdOf(row: UtCourseRow): string | null {
  const dept = normalizeDept(row.department);
  const num = row.number?.trim();
  if (!dept || !num) return null;
  return `${dept} ${num}`;
}

/** Project rule: `E E` is the legacy label for ECE; normalize at load time. */
export function normalizeDept(dept: string | undefined): string | null {
  if (!dept) return null;
  const trimmed = dept.trim();
  if (!trimmed) return null;
  return trimmed === 'E E' ? 'ECE' : trimmed;
}

// ─── Description selection ──────────────────────────────────────────────────────

/**
 * Description lines that are METADATA, not the human course blurb. We strip
 * these so the catalog `description` is the descriptive sentence(s) only.
 * Matched case-insensitively against the START of a trimmed line.
 */
const METADATA_PREFIXES = [
  'prerequisite',
  'restricted to',
  'same as',
  'designed to accommodate',
  'only one of the following',
  'offered on the',
  'course number may be repeated',
  'may be repeated for credit',
  'hour(s) to be arranged',
  'additional hour(s)',
  'additional prerequisite',
];

function isMetadataLine(line: string): boolean {
  const l = line.trim().toLowerCase();
  return METADATA_PREFIXES.some((p) => l.startsWith(p));
}

/**
 * Pick the human description from a UT description array.
 *  - Drops metadata lines (prereq / restriction / grading basis / …).
 *  - Unwraps a leading "Topic description: …" prefix (Topics courses put the
 *    real blurb behind that label).
 *  - Joins the surviving descriptive line(s) into a single string.
 * Returns "" when nothing descriptive remains (207 feed rows have empty desc).
 */
export function selectDescription(lines: string[] | undefined): string {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const kept: string[] = [];
  for (const raw of lines) {
    if (typeof raw !== 'string') continue;
    let line = raw.trim();
    if (!line) continue;
    const topicMatch = line.match(/^topic description:\s*(.+)$/i);
    if (topicMatch) {
      kept.push(topicMatch[1].trim());
      continue;
    }
    if (isMetadataLine(line)) continue;
    kept.push(line);
  }
  return kept.join(' ');
}

// ─── Grading basis detection ────────────────────────────────────────────────────

/**
 * Detect the grading basis from the raw description lines. UT states it
 * explicitly: "Offered on the pass/fail basis only." / "letter-grade basis".
 * Defaults to "letter" when nothing is stated (the catalog's existing default).
 * Matches the existing catalog's grading vocabulary: "letter" | "pass/fail" |
 * "credit/no-credit".
 */
export function detectGrading(lines: string[] | undefined): string {
  if (Array.isArray(lines)) {
    for (const raw of lines) {
      if (typeof raw !== 'string') continue;
      const l = raw.toLowerCase();
      if (l.includes('pass/fail basis') || l.includes('pass-fail basis')) return 'pass/fail';
      if (l.includes('credit/no credit') || l.includes('credit/no-credit')) return 'credit/no-credit';
    }
  }
  return 'letter';
}

// ─── Dedup: many section rows → one course-level row ────────────────────────────

/**
 * Collapse all section rows sharing a course id into ONE catalog entry.
 * When sections disagree we prefer the most complete signal:
 *   - credits: the MAX creditHours seen across sections (variable-credit /
 *     stale rows shouldn't drag a real value down to 0/1).
 *   - description: the LONGEST selected description across sections.
 *   - core: the UNION of every section's mapped CoreCategory set.
 *   - grading: the first non-"letter" basis seen, else "letter".
 *   - title: the first non-empty courseName.
 * Malformed rows (no id) are skipped. Returns a map keyed by course id.
 */
export function dedupRows(rows: readonly UtCourseRow[]): Record<string, CatalogCourse> {
  const out: Record<string, CatalogCourse> = {};
  const coreSets = new Map<string, Set<CoreCategory>>();

  for (const row of rows) {
    const id = courseIdOf(row);
    if (!id) continue;
    const dept = normalizeDept(row.department)!; // non-null: courseIdOf passed
    const desc = selectDescription(row.description);
    const grading = detectGrading(row.description);
    const credits = typeof row.creditHours === 'number' ? row.creditHours : null;
    const title = row.courseName?.trim() || id;

    let entry = out[id];
    if (!entry) {
      entry = {
        id,
        title,
        credits,
        description: desc,
        prerequisites: [],
        corequisites: [],
        grading,
        department: dept,
      };
      out[id] = entry;
    } else {
      // Prefer the MAX credits (covers variable-credit / stale 0-credit rows).
      if (credits !== null && (entry.credits === null || credits > entry.credits)) {
        entry.credits = credits;
      }
      // Prefer the LONGEST description.
      if (desc.length > entry.description.length) entry.description = desc;
      // Prefer a non-"letter" basis if any section states one.
      if (entry.grading === 'letter' && grading !== 'letter') entry.grading = grading;
      // Fill an empty title if a later section has one.
      if (entry.title === id && title !== id) entry.title = title;
    }

    // Union core labels across sections.
    const mapped = mapCoreLabels(row.core);
    if (mapped) {
      let set = coreSets.get(id);
      if (!set) {
        set = new Set();
        coreSets.set(id, set);
      }
      for (const c of mapped) set.add(c);
    }
  }

  // Materialize unioned core sets back onto entries in deterministic order.
  for (const [id, set] of coreSets) {
    const entry = out[id];
    if (entry) entry.core = CORE_ORDER.filter((c) => set.has(c));
  }

  return out;
}

// ─── Merge: dedup result + existing catalog (existing wins, verbatim) ───────────

export interface MergeResult {
  catalog: CourseCatalog;
  /** ids that were newly added (not in the existing catalog). */
  added: string[];
  /** ids that already existed and were preserved verbatim (collision count). */
  preserved: string[];
}

/**
 * Merge deduped UT courses into the existing catalog. The existing catalog is
 * AUTHORITATIVE: every existing entry is copied byte-for-byte (its hand-curated
 * prerequisites feed the solver and must not be touched). Only ids absent from
 * the existing catalog are added from the UT feed. Output keys are sorted so
 * the regenerated JSON diff is reviewable.
 */
export function mergeCatalog(
  existing: CourseCatalog,
  deduped: Record<string, CatalogCourse>
): MergeResult {
  const merged: CourseCatalog = {};
  const added: string[] = [];
  const preserved: string[] = [];

  // 1. Existing entries — verbatim, never mutated.
  for (const id of Object.keys(existing)) {
    merged[id] = existing[id];
  }

  // 2. New UT entries — only ids not already present.
  for (const id of Object.keys(deduped)) {
    if (id in existing) {
      preserved.push(id);
      continue;
    }
    merged[id] = deduped[id];
    added.push(id);
  }

  // 3. Stable, sorted key order for a reviewable diff.
  const sorted: CourseCatalog = {};
  for (const id of Object.keys(merged).sort()) sorted[id] = merged[id];

  return { catalog: sorted, added: added.sort(), preserved: preserved.sort() };
}

/** Count of entries per CoreCategory across a catalog (for the build summary). */
export function coreCounts(catalog: CourseCatalog): Record<CoreCategory, number> {
  const counts = Object.fromEntries(CORE_ORDER.map((c) => [c, 0])) as Record<CoreCategory, number>;
  for (const entry of Object.values(catalog)) {
    for (const c of entry.core ?? []) counts[c]++;
  }
  return counts;
}
