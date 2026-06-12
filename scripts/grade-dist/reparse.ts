#!/usr/bin/env node
/**
 * Grade Distribution Reparser — Per-Instructor Join
 * ===================================================
 * Usage:  npx tsx scripts/grade-dist/reparse.ts
 *
 * Reads all UTGradesPlus CSV files from `utgradesdist_21-26/` and the
 * existing `packages/client/public/data/grade-distributions.json`, then
 * writes an updated JSON with `byInstructor` added to each course entry.
 *
 * ── CSV columns (confirmed by inspection of all 5 exports, 2021-2026) ──
 *   Semester | Section Number | Course Prefix | Course Number | Course Title |
 *   Course | Letter Grade | Count of letter grade | Department/Program
 *
 * ── ABORT CONDITION ──
 *   If the CSV does NOT contain an instructor column the script prints a clear
 *   error and aborts the CSV-based instructor join. It then falls back to
 *   `fall-2026-sections.json` for instructor attribution (see below).
 *
 * ── Instructor name format ──
 *   "First [Middle] Last" — verbatim from fall-2026-sections.json.
 *   Examples: "Nina K Telang", "Shyam Shankar", "Michael E Orshansky".
 *   Sections with no instructor listed → bucketed under "Unknown".
 *
 * ── Fallback strategy (documented limitation) ──
 *   Since the source CSVs lack instructor names, `byInstructor` is populated
 *   using fall-2026-sections.json as the instructor source. Each instructor is
 *   attributed a proportional share of the course-level aggregate (by section-
 *   count ratio). avg_gpa is the course-level average for all instructors.
 *   Per-instructor accuracy will improve when UTGradesPlus adds instructor
 *   columns to its CSV exports.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
// Theme H (item 4): consume the unit-tested parser instead of hand-copying it.
// grade-dist-parser.ts has zero runtime imports (type-only), so importing its
// pure functions into this tsx script is runtime-safe and makes the tested code
// the live code. Types stay inline below (the script's data shapes; not "the parser").
import { hasInstructorColumn, buildByInstructor } from '../../packages/client/src/lib/grade-dist-parser';

// ─── Types (inline to avoid importing from packages/client) ──────────────────

interface GradeSection {
  semester: string;
  section: number;
  grades: Record<string, number>;
  a_pct: number;
  b_pct: number;
  c_pct: number;
  d_pct: number;
  f_pct: number;
  enrollment: number;
  gpa: number;
}

interface GradeDistribution {
  department: string;
  department_code: string;
  course_number: string;
  course_title: string;
  sections: GradeSection[];
  avg_gpa: number;
  a_pct: number;
  b_pct: number;
  c_pct: number;
  d_pct: number;
  f_pct: number;
  total_enrollment: number;
  total_sections: number;
  byInstructor: Record<string, InstructorGradeStats>;
}

interface InstructorGradeStats {
  avg_gpa: number;
  total_enrollment: number;
  distribution: Record<string, number>;
}

interface FallSection {
  unique: number;
  instructor: string;
  [key: string]: unknown;
}

interface FallSectionsData {
  courses: Record<string, { sections: FallSection[] }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..');
const CSV_DIR = path.join(ROOT, 'utgradesdist_21-26');
const GRADE_DIST_PATH = path.join(ROOT, 'packages', 'client', 'public', 'data', 'grade-distributions.json');
const FALL_SECTIONS_PATH = path.join(ROOT, 'packages', 'client', 'public', 'data', 'fall-2026.json');

// ─── CSV helpers ──────────────────────────────────────────────────────────────

/**
 * Read the first line of a CSV file to get the header row.
 */
async function readCsvHeaders(filePath: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    });
    rl.once('line', (line) => {
      rl.close();
      resolve(line.split(',').map((h) => h.trim().replace(/^"|"$/g, '')));
    });
    rl.once('error', reject);
  });
}

// hasInstructorColumn is imported from grade-dist-parser.ts (Theme H item 4).

// ─── Instructor attribution ───────────────────────────────────────────────────

/**
 * Extract instructor name lists for each course from fall-2026-sections.json.
 * Returns: { courseId → string[] of instructor names (one per section) }
 */
function buildCourseInstructorMap(
  fallData: FallSectionsData
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const [courseId, courseData] of Object.entries(fallData.courses)) {
    const names: string[] = [];
    for (const sec of courseData.sections) {
      const name = sec.instructor?.trim() || 'Unknown';
      names.push(name);
    }
    if (names.length > 0) {
      map.set(courseId, names);
    }
  }

  return map;
}

// aggregateDist + buildByInstructor are imported from grade-dist-parser.ts
// (Theme H item 4) — the unit-tested implementations, no longer hand-copied.

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Grade Distribution Reparser ===\n');

  // ── Step 1: Inspect a sample CSV for instructor column ──────────────────
  const csvFiles = fs
    .readdirSync(CSV_DIR)
    .filter((f) => f.endsWith('.csv'))
    .sort();

  if (csvFiles.length === 0) {
    console.error(`ERROR: No CSV files found in ${CSV_DIR}`);
    process.exit(1);
  }

  const sampleCsv = path.join(CSV_DIR, csvFiles[0]);
  console.log(`Inspecting sample CSV: ${csvFiles[0]}`);
  const headers = await readCsvHeaders(sampleCsv);
  console.log(`  Columns found (${headers.length}): ${headers.join(' | ')}`);

  if (!hasInstructorColumn(headers)) {
    console.error(`
╔══════════════════════════════════════════════════════════════════════════╗
║  ABORT: Instructor column not found in UTGradesPlus CSV export          ║
║                                                                          ║
║  Expected one of: "Instructor", "Professor", "Professor Name",           ║
║                   "Instructor Name"                                      ║
║                                                                          ║
║  Columns present: ${headers.slice(0, 5).join(', ')}...
║                                                                          ║
║  The UTGradesPlus 2021-2026 exports do NOT include instructor data.     ║
║  Falling back to fall-2026-sections.json for instructor attribution.    ║
╚══════════════════════════════════════════════════════════════════════════╝
`);
    // Do NOT exit — continue with fallback strategy
  }

  // ── Step 2: Load existing grade-distributions.json ──────────────────────
  console.log('Loading grade-distributions.json...');
  const gradeData = JSON.parse(
    fs.readFileSync(GRADE_DIST_PATH, 'utf-8')
  ) as { courses: Record<string, GradeDistribution> };
  console.log(`  Loaded ${Object.keys(gradeData.courses).length} courses\n`);

  // ── Step 3: Load fall-2026-sections.json for instructor data ────────────
  console.log('Loading fall-2026-sections.json (instructor fallback source)...');
  const fallData = JSON.parse(
    fs.readFileSync(FALL_SECTIONS_PATH, 'utf-8')
  ) as FallSectionsData;
  const instructorMap = buildCourseInstructorMap(fallData);
  console.log(
    `  Found instructor data for ${instructorMap.size} courses in fall-2026-sections.json\n`
  );

  // ── Step 4: Build byInstructor for each course ──────────────────────────
  console.log('Building byInstructor entries...');
  let withData = 0;
  let withoutData = 0;

  for (const [courseId, course] of Object.entries(gradeData.courses)) {
    const instructorNames = instructorMap.get(courseId) ?? [];
    course.byInstructor = buildByInstructor(course, instructorNames);

    if (Object.keys(course.byInstructor).length > 0) {
      withData++;
    } else {
      withoutData++;
    }
  }

  console.log(`  ${withData} courses got byInstructor data`);
  console.log(`  ${withoutData} courses have no instructor data (byInstructor: {})\n`);

  // ── Step 5: Write updated grade-distributions.json ──────────────────────
  const output = JSON.stringify(gradeData, null, 2);
  fs.writeFileSync(GRADE_DIST_PATH, output, 'utf-8');
  console.log(`✅ Written: ${GRADE_DIST_PATH}`);
  console.log(`\nNOTE: byInstructor values are ESTIMATED using fall-2026-sections.json.`);
  console.log(`      avg_gpa reflects the course-level average, not true per-instructor GPA.`);
  console.log(`      Per-instructor accuracy will improve when UTGradesPlus adds instructor`);
  console.log(`      columns to its CSV exports.\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
