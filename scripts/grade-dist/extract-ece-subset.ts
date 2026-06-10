#!/usr/bin/env node
/**
 * Grade Distribution Extractor — ECE Subset Builder
 * ===================================================
 *
 * SOURCES (both MIT-licensed):
 *   1. doprz/UT_Grade_Parser — https://github.com/doprz/UT_Grade_Parser
 *      MIT License, Copyright (c) 2024 doprz
 *      Raw grade data comes from UT Austin Tableau dashboard exports.
 *      CSVs stored in: utgradesdist_21-26/ (5 files, 2021-2026)
 *
 *   2. Longhorn-Developers/UT-Registration-Plus — https://github.com/Longhorn-Developers/UT-Registration-Plus
 *      MIT License, Copyright (c) 2023 Sriram Hariharan
 *      Grade schema and query-layer design referenced from:
 *        src/assets/database/grade_distributions.db
 *        src/views/lib/database/queryDistribution.ts
 *
 * PURPOSE:
 *   Build a small, ECE-scoped grade-distributions.json from the UTGradesPlus
 *   CSV exports. The CSV approach is used instead of the UTRP SQLite DB
 *   because the CSVs cover semesters more recent than the packaged DB snapshot.
 *
 * OUTPUT:
 *   packages/client/public/data/grade-distributions.json
 *   ~2 MB (vs 13 MB for the full UTRP SQLite database)
 *
 * COURSE SCOPE:
 *   Courses from these sources are used to determine which courses to include:
 *     - packages/client/public/data/prerequisite-graph.json (nodes)
 *     - packages/client/public/data/degree-requirements.json (ece_core, math/physics sequences)
 *     - packages/client/public/data/tech-cores.json (elective pools)
 *
 *   In practice, filtering to department_code = "ECE" (after normalizing "E E" → "ECE")
 *   already scopes the output to the relevant courses.
 *
 * USAGE:
 *   npx tsx scripts/grade-dist/extract-ece-subset.ts
 *
 *   Prerequisite: CSVs in utgradesdist_21-26/ (21-22.csv, 22-23.csv, etc.)
 *   These can be downloaded via scripts/data-pipeline/grade_distributions.py --download
 *
 * HOW TO REGENERATE NEXT SEMESTER:
 *   1. Download the latest CSV from the UT Austin Tableau grade dashboard:
 *      https://iq-analytics.austin.utexas.edu/views/Gradedistributiondashboard/
 *   2. Save as utgradesdist_21-26/<YY-YY>.csv
 *   3. Run: npx tsx scripts/grade-dist/extract-ece-subset.ts
 *   4. Run: npx tsx scripts/grade-dist/reparse.ts  (adds byInstructor from fall sections)
 *   5. Commit both the updated JSON and the new CSV.
 *
 * NOTE: This script does NOT run at app runtime. It is a one-off build tool.
 *       Do NOT import it in client code.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  byInstructor: Record<string, unknown>;
}

interface PrereqGraphData {
  nodes: Record<string, unknown>;
}

interface DegreeRequirements {
  ece_core: { courses: string[] };
  math_sequence: { required: string[] };
  physics_sequence: { required: string[] };
}

interface TechCores {
  [trackId: string]: {
    elective_pool: string[];
    required_courses: Record<string, unknown>;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..', '..');
const CSV_DIR = path.join(ROOT, 'utgradesdist_21-26');
const DATA_DIR = path.join(ROOT, 'packages', 'client', 'public', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'grade-distributions.json');

const GRADE_LETTERS = [
  'A+', 'A', 'A-',
  'B+', 'B', 'B-',
  'C+', 'C', 'C-',
  'D+', 'D', 'D-',
  'F', 'Other',
] as const;

/** GPA quality points (UT Austin standard, 4.0 scale) */
const GPA_POINTS: Record<string, number> = {
  'A+': 4.0, 'A': 4.0, 'A-': 3.67,
  'B+': 3.33, 'B': 3.0, 'B-': 2.67,
  'C+': 2.33, 'C': 2.0, 'C-': 1.67,
  'D+': 1.33, 'D': 1.0, 'D-': 0.67,
  'F': 0.0,
};

/** Department codes to include (ECE courses only; "E E" is the legacy UT prefix) */
const TARGET_DEPTS = new Set(['ECE', 'E E']);

// ─── CSV parsing ──────────────────────────────────────────────────────────────

interface RawSection {
  semester: string;
  section: number;
  department: string;
  department_code: string;
  course_number: string;
  course_title: string;
  grades: Record<string, number>;
}

async function parseCsv(filePath: string): Promise<RawSection[]> {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: 'utf-8' }),
    });

    const records = new Map<string, RawSection>();
    let headers: string[] = [];
    let isFirstLine = true;

    rl.on('line', (line) => {
      if (isFirstLine) {
        headers = line.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
        isFirstLine = false;
        return;
      }

      // Simple CSV parse (no embedded commas in these exports)
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < headers.length) return;

      const get = (name: string) => cols[headers.indexOf(name)] ?? '';

      const semester = get('Semester');
      const sectionStr = get('Section Number').trim();
      const prefix = get('Course Prefix').trim();
      const number = get('Course Number').trim();
      const title = get('Course Title').trim();
      const grade = get('Letter Grade').trim();
      const dept = get('Department/Program').trim();
      const countStr = get('Count of letter grade').replace(',', '');
      const count = parseInt(countStr, 10);

      if (!TARGET_DEPTS.has(prefix)) return;
      if (isNaN(count) || count < 0) return;

      const key = `${semester}|${prefix}|${number}|${sectionStr}`;
      if (!records.has(key)) {
        const gradeInit: Record<string, number> = {};
        for (const g of GRADE_LETTERS) gradeInit[g] = 0;
        records.set(key, {
          semester,
          section: /^\d+$/.test(sectionStr) ? parseInt(sectionStr, 10) : 0,
          department: dept,
          department_code: prefix,
          course_number: number,
          course_title: title,
          grades: gradeInit,
        });
      }

      const rec = records.get(key)!;
      if (grade in rec.grades) {
        rec.grades[grade] += count;
      }
    });

    rl.on('close', () => resolve(Array.from(records.values())));
    rl.on('error', reject);
  });
}

// ─── GPA calculation ──────────────────────────────────────────────────────────

function computeGpa(grades: Record<string, number>): number {
  let totalPoints = 0;
  let totalGraded = 0;
  for (const [grade, count] of Object.entries(grades)) {
    if (grade === 'Other' || !(grade in GPA_POINTS)) continue;
    totalPoints += GPA_POINTS[grade] * count;
    totalGraded += count;
  }
  if (totalGraded === 0) return 0;
  return Math.round((totalPoints / totalGraded) * 1000) / 1000;
}

// ─── Determine known courses ──────────────────────────────────────────────────

function loadKnownCourseIds(): Set<string> {
  const ids = new Set<string>();

  // From prerequisite-graph.json nodes
  try {
    const graph = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'prerequisite-graph.json'), 'utf-8')
    ) as PrereqGraphData;
    for (const id of Object.keys(graph.nodes)) ids.add(id);
  } catch {
    console.warn('Warning: could not read prerequisite-graph.json');
  }

  // From degree-requirements.json
  try {
    const reqs = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'degree-requirements.json'), 'utf-8')
    ) as DegreeRequirements;
    for (const id of reqs.ece_core?.courses ?? []) ids.add(id);
    for (const id of reqs.math_sequence?.required ?? []) ids.add(id);
    for (const id of reqs.physics_sequence?.required ?? []) ids.add(id);
  } catch {
    console.warn('Warning: could not read degree-requirements.json');
  }

  // From tech-cores.json elective pools
  try {
    const cores = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'tech-cores.json'), 'utf-8')
    ) as TechCores;
    for (const track of Object.values(cores)) {
      for (const id of track.elective_pool ?? []) ids.add(id);
    }
  } catch {
    console.warn('Warning: could not read tech-cores.json');
  }

  return ids;
}

// ─── Build grade-distributions.json ──────────────────────────────────────────

async function main() {
  console.log('=== Grade Distribution Extractor — ECE Subset ===\n');
  console.log(`Source data: ${CSV_DIR}`);
  console.log(`Output: ${OUTPUT_PATH}\n`);

  // Load CSV files
  const csvFiles = fs.readdirSync(CSV_DIR)
    .filter((f) => f.endsWith('.csv'))
    .sort();

  if (csvFiles.length === 0) {
    console.error(`ERROR: No CSV files found in ${CSV_DIR}`);
    console.error('Download them via: python scripts/data-pipeline/grade_distributions.py --download');
    process.exit(1);
  }

  console.log(`Parsing ${csvFiles.length} CSV files...`);
  const allSections: RawSection[] = [];
  for (const f of csvFiles) {
    const sections = await parseCsv(path.join(CSV_DIR, f));
    const ece = sections.filter((s) => TARGET_DEPTS.has(s.department_code));
    console.log(`  ${f}: ${ece.length} ECE sections`);
    allSections.push(...ece);
  }
  console.log(`Total ECE sections: ${allSections.length}\n`);

  // Build per-course entries
  console.log('Building per-course grade distributions...');
  const courseData = new Map<string, GradeDistribution>();

  for (const sec of allSections) {
    // Normalize "E E" → "ECE"
    const deptCode = sec.department_code === 'E E' ? 'ECE' : sec.department_code;
    const courseKey = `${deptCode} ${sec.course_number}`;
    const grades = sec.grades;
    const total = Object.values(grades).reduce((a, b) => a + b, 0);
    if (total === 0) continue;

    if (!courseData.has(courseKey)) {
      courseData.set(courseKey, {
        department: sec.department,
        department_code: deptCode,
        course_number: sec.course_number,
        course_title: sec.course_title,
        sections: [],
        avg_gpa: 0,
        a_pct: 0,
        b_pct: 0,
        c_pct: 0,
        d_pct: 0,
        f_pct: 0,
        total_enrollment: 0,
        total_sections: 0,
        byInstructor: {},
      });
    }

    const course = courseData.get(courseKey)!;
    const aCount = (grades['A+'] ?? 0) + (grades['A'] ?? 0) + (grades['A-'] ?? 0);
    const bCount = (grades['B+'] ?? 0) + (grades['B'] ?? 0) + (grades['B-'] ?? 0);
    const cCount = (grades['C+'] ?? 0) + (grades['C'] ?? 0) + (grades['C-'] ?? 0);
    const dCount = (grades['D+'] ?? 0) + (grades['D'] ?? 0) + (grades['D-'] ?? 0);
    const fCount = grades['F'] ?? 0;

    course.sections.push({
      semester: sec.semester,
      section: sec.section,
      grades,
      a_pct: Math.round((aCount / total) * 1000) / 10,
      b_pct: Math.round((bCount / total) * 1000) / 10,
      c_pct: Math.round((cCount / total) * 1000) / 10,
      d_pct: Math.round((dCount / total) * 1000) / 10,
      f_pct: Math.round((fCount / total) * 1000) / 10,
      enrollment: total,
      gpa: computeGpa(grades),
    });
  }

  // Compute course-level aggregates
  for (const course of courseData.values()) {
    course.sections.sort((a, b) => a.semester.localeCompare(b.semester));
    const totalEnrolled = course.sections.reduce((s, sec) => s + sec.enrollment, 0);
    course.total_enrollment = totalEnrolled;
    course.total_sections = course.sections.length;

    if (totalEnrolled > 0) {
      const w = (fn: (s: GradeSection) => number) =>
        Math.round(course.sections.reduce((s, sec) => s + fn(sec) * sec.enrollment, 0) / totalEnrolled * 10) / 10;

      course.avg_gpa = Math.round(
        course.sections.reduce((s, sec) => s + sec.gpa * sec.enrollment, 0) / totalEnrolled * 1000
      ) / 1000;
      course.a_pct = w((s) => s.a_pct);
      course.b_pct = w((s) => s.b_pct);
      course.c_pct = w((s) => s.c_pct);
      course.d_pct = w((s) => s.d_pct);
      course.f_pct = w((s) => s.f_pct);
    }
  }

  // Cross-check against known courses from static data files
  const knownIds = loadKnownCourseIds();
  const knownEceIds = Array.from(knownIds).filter((id) => id.startsWith('ECE '));
  const covered = knownEceIds.filter((id) => courseData.has(id));
  console.log(`Known ECE courses in prereq-graph/degree-reqs: ${knownEceIds.length}`);
  console.log(`Covered by CSV data: ${covered.length}`);
  const missing = knownEceIds.filter((id) => !courseData.has(id));
  if (missing.length > 0) {
    console.log(`  Missing: ${missing.join(', ')}`);
  }

  // Write output
  const output = {
    courses: Object.fromEntries(courseData),
    total_courses: courseData.size,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf-8');
  const bytes = fs.statSync(OUTPUT_PATH).size;
  console.log(`\nWritten: ${OUTPUT_PATH}`);
  console.log(`Size: ${(bytes / 1024).toFixed(0)} KB (${courseData.size} courses)`);
  console.log('\nNext step: npx tsx scripts/grade-dist/reparse.ts');
  console.log('(Adds byInstructor entries from fall-2026-sections.json)\n');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
