#!/usr/bin/env node
/**
 * Offering-pattern aggregation — TASK-053
 *
 * Reads every per-term section file in packages/client/public/data/
 * (fall-YYYY.json, spring-YYYY.json, summer-YYYY.json) and derives
 * offered_semesters for each course from the OBSERVED terms.
 *
 * Merges into offering-schedule.json:
 *   - Observed courses: offered_semesters updated from seen terms; provenance
 *     set to "observed".
 *   - Curated-only courses (in offering-schedule.json but not yet scraped):
 *     kept exactly as-is with provenance "curated" so no regression occurs.
 *
 * Run: npm run aggregate:offerings
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Season } from './lib/term-codes';

// ─── Repo paths ───────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DATA = path.join(REPO_ROOT, 'packages', 'client', 'public', 'data');
const OFFERING_SCHEDULE_PATH = path.join(PUBLIC_DATA, 'offering-schedule.json');

// ─── Schema ───────────────────────────────────────────────────────────────────

/**
 * The per-term section file written by fetch-term.ts.
 * We only need the keys of `courses` (course IDs) and their titles.
 */
interface TermFile {
  semester: string;
  semester_code: string;
  courses: Record<string, { course: string; title: string }>;
}

/**
 * One entry in offering-schedule.json.
 * `offerings` is a legacy map of specific term keys like "fall_26" → bool.
 * `offered_semesters` is the derived season list (fall/spring/summer).
 * `provenance` is "observed" when derived from scraped data, "curated" when
 * the entry was hand-authored and has not yet been confirmed by observed data.
 */
export interface OfferingEntry {
  title: string;
  offerings: Record<string, boolean>;
  offered_semesters: Season[];
  provenance?: 'observed' | 'curated';
}

export type OfferingSchedule = Record<string, OfferingEntry>;

// ─── Term-file discovery ──────────────────────────────────────────────────────

const TERM_FILE_PATTERN = /^(fall|spring|summer)-(\d{4})\.json$/;

/** Return Season from a term-slug filename match. */
function seasonFromSlug(filename: string): Season | null {
  const match = TERM_FILE_PATTERN.exec(filename);
  if (!match) return null;
  return match[1] as Season;
}

interface TermFileInfo {
  filename: string;
  season: Season;
  path: string;
  data: TermFile;
}

/**
 * Find and load all per-term section files in the data directory.
 * Files matching the pattern fall|spring|summer-YYYY.json are included.
 * `offering-schedule.json` and other data files are excluded.
 */
export function loadTermFiles(dataDir: string): TermFileInfo[] {
  if (!fs.existsSync(dataDir)) return [];

  const results: TermFileInfo[] = [];
  for (const filename of fs.readdirSync(dataDir)) {
    const season = seasonFromSlug(filename);
    if (!season) continue;

    const filePath = path.join(dataDir, filename);
    let data: TermFile;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TermFile;
    } catch {
      console.warn(`  Skipping ${filename}: could not parse as JSON`);
      continue;
    }

    if (!data.courses || typeof data.courses !== 'object') {
      console.warn(`  Skipping ${filename}: missing courses field`);
      continue;
    }

    results.push({ filename, season, path: filePath, data });
  }

  return results;
}

// ─── Aggregation logic ────────────────────────────────────────────────────────

/**
 * Derive offered_semesters for a course from the set of seasons in which
 * it was observed. Seasons are deduplicated and sorted fall/spring/summer
 * for deterministic output.
 */
const SEASON_ORDER: Season[] = ['fall', 'spring', 'summer'];

function sortSeasons(seasons: Set<Season>): Season[] {
  return SEASON_ORDER.filter((s) => seasons.has(s));
}

/**
 * Aggregate all per-term files into an updated offering-schedule.
 *
 * Strategy:
 *   1. Start from the existing offering-schedule.json (curated baseline).
 *   2. Build an observation map: courseId → Set<Season> from term files.
 *   3. For each observed course:
 *      - If present in existing schedule, update offered_semesters from
 *        observed seasons, set provenance "observed".
 *      - If new (not in existing schedule), create a fresh entry with
 *        provenance "observed" and title from the section file.
 *   4. For each curated course not yet observed:
 *      - Keep exactly as-is, set provenance "curated".
 *
 * This preserves curated entries and never regresses existing coverage.
 */
export function aggregate(
  termFiles: TermFileInfo[],
  existing: OfferingSchedule
): OfferingSchedule {
  // Build observation map: courseId → Set<Season>
  const observed = new Map<string, { seasons: Set<Season>; title: string }>();

  for (const { season, data } of termFiles) {
    for (const [courseId, course] of Object.entries(data.courses)) {
      const entry = observed.get(courseId) ?? { seasons: new Set<Season>(), title: course.title };
      entry.seasons.add(season);
      // Prefer the most recently seen title (last write wins, but stable in practice)
      entry.title = course.title;
      observed.set(courseId, entry);
    }
  }

  const result: OfferingSchedule = {};

  // First, process all observed courses (update or create)
  for (const [courseId, { seasons, title }] of Array.from(observed.entries())) {
    const existingEntry = existing[courseId];
    result[courseId] = {
      title: existingEntry?.title ?? title,
      offerings: existingEntry?.offerings ?? {},
      offered_semesters: sortSeasons(seasons),
      provenance: 'observed',
    };
  }

  // Then, preserve curated entries that have not yet been observed
  for (const [courseId, entry] of Object.entries(existing)) {
    if (!result[courseId]) {
      result[courseId] = {
        title: entry.title,
        offerings: entry.offerings,
        offered_semesters: entry.offered_semesters,
        provenance: entry.provenance ?? 'curated',
      };
    }
  }

  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('DegreeForge — offering aggregation (TASK-053)');
  console.log(`Data directory: ${path.relative(REPO_ROOT, PUBLIC_DATA)}`);

  // Load existing curated schedule (or start empty if file doesn't exist)
  let existing: OfferingSchedule = {};
  if (fs.existsSync(OFFERING_SCHEDULE_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(OFFERING_SCHEDULE_PATH, 'utf-8')) as OfferingSchedule;
      console.log(`Loaded existing offering-schedule.json (${Object.keys(existing).length} entries)`);
    } catch {
      console.warn('Could not parse existing offering-schedule.json — starting fresh');
      existing = {};
    }
  } else {
    console.log('No existing offering-schedule.json — starting fresh');
  }

  // Load per-term section files
  const termFiles = loadTermFiles(PUBLIC_DATA);
  if (termFiles.length === 0) {
    console.warn('No per-term section files found. Run fetch:sections first.');
    console.warn('Preserving existing offering-schedule.json without changes.');
    process.exit(0);
  }

  console.log(`Found ${termFiles.length} term file(s):`);
  for (const { filename, season } of termFiles) {
    const courseCount = Object.keys(termFiles.find((t) => t.filename === filename)!.data.courses).length;
    console.log(`  ${filename} (season=${season}, ${courseCount} courses)`);
  }

  // Aggregate
  const updated = aggregate(termFiles, existing);

  const observedCount = Object.values(updated).filter((e) => e.provenance === 'observed').length;
  const curatedCount = Object.values(updated).filter((e) => e.provenance === 'curated').length;
  console.log(`Aggregated: ${Object.keys(updated).length} total entries`);
  console.log(`  ${observedCount} observed (from scraped data)`);
  console.log(`  ${curatedCount} curated (preserved from existing, not yet observed)`);

  // Write output
  fs.writeFileSync(OFFERING_SCHEDULE_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  console.log(`Wrote: ${path.relative(REPO_ROOT, OFFERING_SCHEDULE_PATH)}`);
}

// Run main only when invoked directly (not when imported by tests)
const isEntryPoint =
  process.argv[1] &&
  (process.argv[1].endsWith('aggregate-offerings.ts') ||
    process.argv[1].endsWith('aggregate-offerings.js'));

if (isEntryPoint) {
  main().catch((err) => {
    console.error('\naggregate-offerings failed:');
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
