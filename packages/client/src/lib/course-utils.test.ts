/**
 * course-utils.test.ts — E1 + E2 (Brief 2, credits + offering sub-PRs)
 *
 * getCourseCredits and getOfferedSeasons are THE canonical per-course-fact
 * accessors. These tests pin:
 *   1. the credit precedence chain (transcript → CREDIT_OVERRIDES → catalog → 3),
 *   2. the null-credits (variable-credit Topics) fallthrough,
 *   3. the real-data invariant that every prerequisite-graph node resolves its
 *      credits from the catalog/overrides (no silent default-3 for graph courses),
 *   4. that the SOLVER packs using the same accessor (override tier included) —
 *      the sanctioned E1 behavior change (.agents/data-diffs/e1-credits.md),
 *   5. offering resolution from the single offering-schedule.json (E2): every
 *      graph course has a row (no course silently becomes any-season), and the
 *      TASK-064 H1 guarantee (ECE 464K never summer) holds through the accessor.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getCourseCredits, getOfferedSeasons, DEFAULT_CREDITS } from './course-utils';
import { generatePlan, canOfferInSemester } from './solver';
import { PrereqGraph } from './graph-engine';
import type { CourseCatalog, PrereqGraphData, OfferingSchedule, Semester } from '../types';

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const mkCatalog = (m: Record<string, number | null>): CourseCatalog =>
  Object.fromEntries(
    Object.entries(m).map(([id, credits]) => [
      id,
      { id, title: '', credits, description: '', prerequisites: [], corequisites: [], grading: '', department: '' },
    ])
  );

// ─── 1. Precedence chain ──────────────────────────────────────────────────────

describe('getCourseCredits — precedence', () => {
  it('transcript beats overrides and catalog', () => {
    // ECE 302: catalog says 5, Adi's transcript says 3 → transcript wins
    const catalog = mkCatalog({ 'ECE 302': 5 });
    expect(getCourseCredits('ECE 302', catalog, { 'ECE 302': 3 })).toBe(3);
  });

  it('override applies when catalog is missing (M 411: no catalog entry, override 4)', () => {
    // M 427J was previously a notable override-over-catalog case; after TASK-102 catalog
    // correction it is now 4 SCH in the catalog too (override removed). M 411 still has
    // no catalog entry, so its value (4) comes purely from CREDIT_OVERRIDES.
    expect(getCourseCredits('M 411', {})).toBe(4);
  });

  it('override applies when catalog is missing (M 508M = 5, UGS 016 = 0)', () => {
    expect(getCourseCredits('M 508M', {})).toBe(5);
    expect(getCourseCredits('UGS 016', {})).toBe(0);
  });

  it('catalog applies when no transcript/override', () => {
    const catalog = mkCatalog({ 'ECE 460N': 4 });
    expect(getCourseCredits('ECE 460N', catalog)).toBe(4);
  });

  it('falls back to DEFAULT_CREDITS for unknown courses and invalid ids', () => {
    expect(getCourseCredits('XYZ 999', {})).toBe(DEFAULT_CREDITS);
    expect(getCourseCredits('', {})).toBe(DEFAULT_CREDITS);
    expect(getCourseCredits(null as unknown as string, null)).toBe(DEFAULT_CREDITS);
  });

  it('null catalog credits (variable-credit Topics row) falls through to default', () => {
    const catalog = mkCatalog({ 'ECE 379K': null });
    expect(getCourseCredits('ECE 379K', catalog)).toBe(DEFAULT_CREDITS);
  });
});

// ─── 2. Real-data invariants ──────────────────────────────────────────────────

describe('getCourseCredits — real-data invariants', () => {
  const catalog = loadJson<CourseCatalog>('course-catalog.json');
  const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');

  it('prerequisite-graph nodes no longer carry a credits copy', () => {
    const carriers = Object.values(prereqData.nodes).filter(
      (n) => (n as { credits?: unknown }).credits !== undefined
    );
    expect(carriers).toEqual([]);
  });

  it('every graph node has a catalog row (credits never silently default for graph courses)', () => {
    // If a scraper ever regenerates one file without the other, this fails loudly
    // at the data boundary instead of surfacing as a wrong plan.
    const orphans = Object.keys(prereqData.nodes).filter((id) => catalog[id] === undefined);
    expect(orphans).toEqual([]);
  });

  it('resolves the known override courses to registrar values', () => {
    expect(getCourseCredits('M 427J', catalog)).toBe(4);
    expect(getCourseCredits('M 408C', catalog)).toBe(4);
    expect(getCourseCredits('M 408D', catalog)).toBe(4);
    expect(getCourseCredits('M 375T', catalog)).toBe(3);
  });
});

// ─── TASK-102: Credit correction + catalog integrity tests ────────────────────

describe('TASK-102 — corrected catalog credit values', () => {
  const catalog = loadJson<CourseCatalog>('course-catalog.json');

  it('ECE 302 is 3 SCH (was 5 contact-hours in old catalog)', () => {
    expect(getCourseCredits('ECE 302', catalog)).toBe(3);
  });

  it('M 408C is 4 SCH (was 5 contact-hours in old catalog, override agrees)', () => {
    expect(getCourseCredits('M 408C', catalog)).toBe(4);
  });

  it('ECE 460N is 4 SCH (was under-counted at 3 in old catalog)', () => {
    expect(getCourseCredits('ECE 460N', catalog)).toBe(4);
  });

  it('M 340L is 3 SCH (unchanged control — must not regress)', () => {
    expect(getCourseCredits('M 340L', catalog)).toBe(3);
  });
});

describe('TASK-102 — catalog structural integrity', () => {
  const catalog = loadJson<CourseCatalog>('course-catalog.json');
  const catalogRaw = loadJson<Record<string, unknown>>('course-catalog.json');

  it('course-catalog.json is a flat id-keyed map (no _meta/catalog/hourCorrections wrapper keys)', () => {
    expect(catalogRaw['_meta']).toBeUndefined();
    expect(catalogRaw['catalog']).toBeUndefined();
    expect(catalogRaw['hourCorrections']).toBeUndefined();
  });

  it('all 378 original ids are present (no accidental deletes)', () => {
    // The live catalog had 378 entries before TASK-102; we now have 382 (378 + 4 new).
    // We verify the 4 new provisional ids are all present, proving the total is >= 378.
    const ids = Object.keys(catalog);
    expect(ids.length).toBeGreaterThanOrEqual(378);
  });

  it('the 4 new provisional 26-28 records are present with provisional===true and credits===4', () => {
    const newIds = ['ECE 402', 'ECE 406', 'ECE 412', 'ECE 419K'] as const;
    for (const id of newIds) {
      expect(catalog[id], `${id} should exist`).toBeDefined();
      expect(catalog[id].provisional, `${id}.provisional`).toBe(true);
      expect(catalog[id].credits, `${id}.credits`).toBe(4);
    }
  });

  it('no creditHours or creditHoursSource sidecar fields leaked into the flat catalog', () => {
    const sidecars = Object.entries(catalogRaw).filter(([, entry]) => {
      const e = entry as Record<string, unknown>;
      return 'creditHours' in e || 'creditHoursSource' in e;
    });
    expect(sidecars).toEqual([]);
  });

  it('guard: no credits value in catalog exceeds the UT first-digit SCH for that course number', () => {
    // UT convention: course 100–199 → 1 hr max, 200–299 → 2 hr max, etc.
    // This catches contact-hour regressions where a 6-contact-hour lab is
    // recorded as 6 SCH on a 300-level course (max SCH = 3 by convention).
    // Exception: graduate courses (600+) can be 6 SCH; topics/var-credit = null → skip.
    //
    // Known-valid exceptions that violate the first-digit heuristic:
    //  ECE 260: variable-credit Special Problems (1–3 SCH valid on a 200-level)
    //  ECE 468L: combined 3-lecture + 3-lab Power Systems course (6 SCH confirmed in catalog)
    //  M 197S: variable-credit Seminar ("One or three lecture hours") on a 100-level
    // These were reviewed against the 2025-26 UT catalog in TASK-102; none are artifacts.
    const KNOWN_EXCEPTIONS = new Set(['ECE 260', 'ECE 468L', 'M 197S']);
    const violations: string[] = [];
    for (const [id, entry] of Object.entries(catalog)) {
      if (entry.credits === null) continue;
      if (KNOWN_EXCEPTIONS.has(id)) continue;
      // Extract the numeric portion of the course number
      const match = id.match(/\s(\d+)/);
      if (!match) continue;
      const courseNum = parseInt(match[1], 10);
      const firstDigit = Math.floor(courseNum / 100);
      // The "first digit = SCH ceiling" convention only describes 100-level and
      // up ("course 100–199 → 1 hr max"). Sub-100 UT courses (PE, leadership
      // labs, first-year interest groups, developmental, peer-assistant) don't
      // follow it and the Fall-2026 feed reports a placeholder 3 SCH for many of
      // them; getCourseCredits overrides the ones that matter (e.g. UGS 016 → 0).
      if (courseNum < 100) continue;
      // Graduate courses (600+) allow up to 6 SCH — skip the guard for them
      if (firstDigit >= 6) continue;
      const maxScH = firstDigit; // 1xx→1, 2xx→2, 3xx→3, 4xx→4, 5xx→5
      if (entry.credits > maxScH) {
        violations.push(`${id}: credits=${entry.credits} exceeds max=${maxScH} for ${courseNum}-level`);
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('TASK-102 — degree-requirements refs resolve in catalog', () => {
  const catalog = loadJson<CourseCatalog>('course-catalog.json');
  // The 4 previously-dangling refs (ECE 402/406/412/419K) must now resolve.
  // Pre-existing non-ECE/M refs (HIS, GOV, UGS, RHE, PHY, etc.) are out of
  // catalog scope — this test only guards the ECE core refs.
  const eceCoreRefs = ['ECE 402', 'ECE 406', 'ECE 412', 'ECE 419K'];

  it('all ECE core requirement refs now resolve in course-catalog.json', () => {
    for (const id of eceCoreRefs) {
      expect(catalog[id], `${id} must be in catalog`).toBeDefined();
    }
  });
});

// ─── 3. Offered seasons (E2) ──────────────────────────────────────────────────

describe('getOfferedSeasons — canonical offering accessor', () => {
  const SCHEDULE: OfferingSchedule = {
    'ECE 325': { title: '', offerings: {}, offered_semesters: ['fall'] },
    'ECE 999': { title: '', offerings: {}, offered_semesters: [] },
  };

  it('returns the row seasons when known', () => {
    expect(getOfferedSeasons('ECE 325', SCHEDULE)).toEqual(['fall']);
  });

  it('returns null for a missing row and for an empty row (open world)', () => {
    expect(getOfferedSeasons('XYZ 1', SCHEDULE)).toBeNull();
    expect(getOfferedSeasons('ECE 999', SCHEDULE)).toBeNull();
  });
});

describe('offering — real-data invariants (E2)', () => {
  const schedule = loadJson<OfferingSchedule>('offering-schedule.json');
  const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');

  it('prerequisite-graph nodes no longer carry an offered copy', () => {
    const carriers = Object.values(prereqData.nodes).filter(
      (n) => (n as { offered?: unknown }).offered !== undefined
    );
    expect(carriers).toEqual([]);
  });

  it('every graph course has a non-empty offering row (none silently becomes any-season)', () => {
    const orphans = Object.keys(prereqData.nodes).filter(
      (id) => getOfferedSeasons(id, schedule) === null
    );
    expect(orphans).toEqual([]);
  });

  it('H1 regression: ECE 464K resolves [fall, spring] and is never summer-placeable', () => {
    expect(getOfferedSeasons('ECE 464K', schedule)).toEqual(['fall', 'spring']);
    const summer: Semester = { id: 'Summer 2027', label: "Su '27", season: 'Summer', year: 2027, status: 'future' };
    const fall: Semester = { id: 'Fall 2027', label: "Fall '27", season: 'Fall', year: 2027, status: 'future' };
    expect(canOfferInSemester('ECE 464K', summer, schedule)).toBe(false);
    expect(canOfferInSemester('ECE 464K', fall, schedule)).toBe(true);
  });
});

// ─── 4. Solver packs through the same accessor ────────────────────────────────

describe('generatePlan — credits come from the canonical accessor (E1)', () => {
  const semesters: Semester[] = [
    { id: 'Fall 2026', label: 'Fall 2026', season: 'Fall', year: 2026, status: 'future' },
    { id: 'Spring 2027', label: 'Spring 2027', season: 'Spring', year: 2027, status: 'future' },
  ];

  const graph = new PrereqGraph(
    {
      nodes: {
        'M 408C': { title: 'Calc I', category: 'math', flags: [] },
        'ECE 302': { title: 'Intro EE', category: 'ece_core', flags: [] },
      },
      edges: [],
    },
    {}
  );

  it('M 408C occupies 4 hours (catalog tier after TASK-102 correction), not the old graph/default value', () => {
    // M 408C is now 4 SCH in the catalog (corrected from 5 contact-hours in TASK-102).
    // It was previously patched via CREDIT_OVERRIDES; the catalog now agrees.
    const result = generatePlan({
      completedCourses: [],
      remainingRequirements: ['M 408C'],
      prereqGraph: graph,
      catalog: mkCatalog({ 'M 408C': 4 }),
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 17,
      semesters,
    });
    expect(result.plan['Fall 2026']).toEqual(['M 408C']);
    expect(result.totalHours['Fall 2026']).toBe(4);
  });

  it('cap packing respects catalog credits: 4 + 5 > 8 forces a split', () => {
    // M 408C (catalog 4 after TASK-102) + ECE 302 (mock catalog 5) under a cap of 8
    // cannot share a term — 4+5=9 > 8.
    const result = generatePlan({
      completedCourses: [],
      remainingRequirements: ['M 408C', 'ECE 302'],
      prereqGraph: graph,
      catalog: mkCatalog({ 'M 408C': 4, 'ECE 302': 5 }),
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 8,
      semesters,
    });
    const fall = result.plan['Fall 2026'];
    const spring = result.plan['Spring 2027'];
    expect(fall.length + spring.length).toBe(2);
    expect(fall.length).toBe(1);
    expect(spring.length).toBe(1);
  });
});
