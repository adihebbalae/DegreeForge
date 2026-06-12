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

  it('override beats catalog (M 427J: catalog 5 vs override 4)', () => {
    const catalog = mkCatalog({ 'M 427J': 5 });
    expect(getCourseCredits('M 427J', catalog)).toBe(4);
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

  it('M 408C occupies 4 hours (override tier), not the old graph/default value', () => {
    const result = generatePlan({
      completedCourses: [],
      remainingRequirements: ['M 408C'],
      prereqGraph: graph,
      catalog: {},
      offeringSchedule: {},
      pinnedCourses: {},
      maxHoursPerSemester: 17,
      semesters,
    });
    expect(result.plan['Fall 2026']).toEqual(['M 408C']);
    expect(result.totalHours['Fall 2026']).toBe(4);
  });

  it('cap packing respects override credits: 4 + 5 > 8 forces a split', () => {
    // M 408C (override 4) + ECE 302 (catalog 5) under a cap of 8 cannot share a term.
    const result = generatePlan({
      completedCourses: [],
      remainingRequirements: ['M 408C', 'ECE 302'],
      prereqGraph: graph,
      catalog: mkCatalog({ 'ECE 302': 5 }),
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
