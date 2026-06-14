/**
 * offering-verification.test.ts — TASK-081 acceptance tests.
 *
 * Covers the "unverified-offered" relaxation:
 *   1. Verified-term set derivation from sections-index.json (real data).
 *   2. Manual-placement predicate: a fall-only course CAN be placed into an
 *      UNVERIFIED future term, but is STILL BLOCKED from a VERIFIED off-season
 *      term (verified enforcement unchanged).
 *   3. The solver relaxes only when `verifiedTerms` is threaded (manual path);
 *      without it (auto path) the strict offering gate is unchanged.
 *   4. The deterministic auto-planner / Recommend still respects real offerings
 *      (a fall-only course is never auto-placed into a non-fall term) — real data.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  semesterToTermSlug,
  buildVerifiedTermSet,
  isOfferingVerifiedForTerm,
  isOfferingAllowedForManualPlacement,
  isUnverifiedOfferingPlacement,
} from './offering-verification';
import { generatePlan, canOfferInSemester, type SolverInput } from './solver';
import { generateAutoPlan } from './auto-planner';
import { PrereqGraph } from './graph-engine';
import { getOfferedSeasons } from './course-utils';
import { SEMESTERS } from '../context/PlanContext.constants';
import type {
  UserProfile,
  DegreeRequirements,
  TechCores,
  MathRequirements,
  PrereqGraphData,
  OfferingSchedule,
  CourseCatalog,
  SectionsIndex,
  Semester,
} from '../types';

// ─── Real data ────────────────────────────────────────────────────────────────

function loadJson<T>(filename: string): T {
  const path = join(__dirname, '../../public/data', filename);
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

const profile = loadJson<UserProfile>('user-profile.json');
const degreeReqs = loadJson<DegreeRequirements>('degree-requirements.json');
const techCores = loadJson<TechCores>('tech-cores.json');
const mathReqs = loadJson<MathRequirements>('math-requirements.json');
const prereqData = loadJson<PrereqGraphData>('prerequisite-graph.json');
const offeringSchedule = loadJson<OfferingSchedule>('offering-schedule.json');
const catalog = loadJson<CourseCatalog>('course-catalog.json');
const sectionsIndex = loadJson<SectionsIndex>('sections-index.json');
const prereqGraph = new PrereqGraph(prereqData);

// A real fall-only course (offering-schedule says ["fall"] only).
const FALL_ONLY = 'ECE 360G';

// Sanity: confirm the fixture course really is fall-only in the live schedule.
// If the data changes this guards the whole suite from silently going green.
expect(getOfferedSeasons(FALL_ONLY, offeringSchedule)).toEqual(['fall']);

// ─── #1 — verified-term set from sections-index.json ──────────────────────────

describe('TASK-081 #1 — verified-term derivation', () => {
  it('semesterToTermSlug maps a Semester to the sections-index slug format', () => {
    const fall2026: Semester = {
      id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall',
    };
    const spring2027: Semester = {
      id: 'Spring 2027', label: "Sp '27", status: 'future', year: 2027, season: 'Spring',
    };
    expect(semesterToTermSlug(fall2026)).toBe('fall-2026');
    expect(semesterToTermSlug(spring2027)).toBe('spring-2027');
  });

  it('buildVerifiedTermSet contains exactly the scraped term slugs from real data', () => {
    const verified = buildVerifiedTermSet(sectionsIndex);
    // Every slug in the manifest is verified…
    for (const t of sectionsIndex.terms) {
      expect(verified.has(t.slug)).toBe(true);
    }
    // …and the set size matches the manifest (no extras invented).
    expect(verified.size).toBe(sectionsIndex.terms.length);
    // The real manifest currently ships fall-2026 as a scraped term.
    expect(verified.has('fall-2026')).toBe(true);
  });

  it('null manifest (still loading) → empty set → every term unverified', () => {
    const verified = buildVerifiedTermSet(null);
    expect(verified.size).toBe(0);
    const anyTerm: Semester = {
      id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall',
    };
    expect(isOfferingVerifiedForTerm(anyTerm, verified)).toBe(false);
  });

  it('isOfferingVerifiedForTerm: a scraped term is verified, a far-future term is not', () => {
    const verified = buildVerifiedTermSet(sectionsIndex);
    const fall2026: Semester = {
      id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall',
    };
    const spring2027: Semester = {
      id: 'Spring 2027', label: "Sp '27", status: 'future', year: 2027, season: 'Spring',
    };
    expect(isOfferingVerifiedForTerm(fall2026, verified)).toBe(true);
    expect(isOfferingVerifiedForTerm(spring2027, verified)).toBe(false);
  });
});

// ─── #2 — manual-placement relaxation (predicate-level) ───────────────────────

describe('TASK-081 #2 — manual placement: relax unverified, keep verified strict', () => {
  // Synthetic verified set so the test owns BOTH a verified AND an unverified
  // off-season term independent of what the shipped manifest happens to contain.
  // spring-2026 is "verified"; spring-2027 is "unverified".
  const verifiedTerms = new Set(['fall-2026', 'spring-2026']);

  const verifiedSpring: Semester = {
    id: 'Spring 2026', label: "Sp '26", status: 'future', year: 2026, season: 'Spring',
  };
  const unverifiedSpring: Semester = {
    id: 'Spring 2027', label: "Sp '27", status: 'future', year: 2027, season: 'Spring',
  };

  it('a fall-only course CAN be manually placed into an UNVERIFIED spring term', () => {
    // Strict schedule forbids spring for a fall-only course…
    expect(canOfferInSemester(FALL_ONLY, unverifiedSpring, offeringSchedule)).toBe(false);
    // …but the manual predicate relaxes it because the term is unverified.
    expect(
      isOfferingAllowedForManualPlacement(FALL_ONLY, unverifiedSpring, offeringSchedule, verifiedTerms)
    ).toBe(true);
    // And that placement is flagged for the "(unverified offered)" indicator.
    expect(
      isUnverifiedOfferingPlacement(FALL_ONLY, unverifiedSpring, offeringSchedule, verifiedTerms)
    ).toBe(true);
  });

  it('the SAME course is STILL BLOCKED from a VERIFIED off-season spring term', () => {
    // Verified term → strict enforcement, exactly as before.
    expect(canOfferInSemester(FALL_ONLY, verifiedSpring, offeringSchedule)).toBe(false);
    expect(
      isOfferingAllowedForManualPlacement(FALL_ONLY, verifiedSpring, offeringSchedule, verifiedTerms)
    ).toBe(false);
    // No "(unverified offered)" note on a verified term — the block is real.
    expect(
      isUnverifiedOfferingPlacement(FALL_ONLY, verifiedSpring, offeringSchedule, verifiedTerms)
    ).toBe(false);
  });

  it('a fall-only course in a VERIFIED FALL term is allowed and NOT flagged', () => {
    const verifiedFall: Semester = {
      id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall',
    };
    expect(
      isOfferingAllowedForManualPlacement(FALL_ONLY, verifiedFall, offeringSchedule, verifiedTerms)
    ).toBe(true);
    // Genuinely offered → no indicator.
    expect(
      isUnverifiedOfferingPlacement(FALL_ONLY, verifiedFall, offeringSchedule, verifiedTerms)
    ).toBe(false);
  });

  it('a course offered in an UNVERIFIED term anyway is NOT flagged (only off-season placements are)', () => {
    // A fall-only course placed in an UNVERIFIED FALL term: schedule already
    // allows fall, so there is nothing to flag.
    const unverifiedFall: Semester = {
      id: 'Fall 2027', label: "Fall '27", status: 'future', year: 2027, season: 'Fall',
    };
    expect(isOfferingVerifiedForTerm(unverifiedFall, verifiedTerms)).toBe(false);
    expect(
      isUnverifiedOfferingPlacement(FALL_ONLY, unverifiedFall, offeringSchedule, verifiedTerms)
    ).toBe(false);
  });

  it('past/current placements are always allowed and never flagged (TASK-068 coexistence)', () => {
    const pastSpring: Semester = {
      id: 'Spring 2024', label: "Sp '24", status: 'past', year: 2024, season: 'Spring',
    };
    expect(
      isOfferingAllowedForManualPlacement(FALL_ONLY, pastSpring, offeringSchedule, verifiedTerms)
    ).toBe(true);
    expect(
      isUnverifiedOfferingPlacement(FALL_ONLY, pastSpring, offeringSchedule, verifiedTerms)
    ).toBe(false);
  });
});

// ─── #3 — solver relaxes only with verifiedTerms (manual path) ────────────────

describe('TASK-081 #3 — solver gate: relax with verifiedTerms, strict without', () => {
  // A timeline whose ONLY future term is an unverified off-season spring. A
  // fall-only required course has nowhere strict to go — so the auto path must
  // leave it UNPLACED, while the manual (relaxed) path places it there.
  const semesters: Semester[] = [
    { id: 'Fall 2025', label: "Fall '25", status: 'past', year: 2025, season: 'Fall' },
    { id: 'Spring 2027', label: "Sp '27", status: 'future', year: 2027, season: 'Spring' },
  ];
  const verifiedTerms = new Set(['fall-2026', 'spring-2026']); // spring-2027 NOT verified

  // Seed FALL_ONLY's prereqs as completed so the ONLY remaining gate on its
  // placement is the offering relaxation under test (not unmet prereqs). The
  // real prereq CNF for ECE 360G is satisfied by ECE 422C + a C S data-structures
  // course, so we mark both done in a past term.
  const baseInput: SolverInput = {
    completedCourses: ['ECE 422C', 'C S 314', 'ECE 360C', 'C S 331'],
    remainingRequirements: [FALL_ONLY],
    prereqGraph,
    catalog,
    offeringSchedule,
    pinnedCourses: {},
    maxHoursPerSemester: 17,
    semesters,
    existingPlan: { 'Fall 2025': [], 'Spring 2027': [] },
  };

  it('STRICT (no verifiedTerms): fall-only course is NOT placed into the off-season spring', () => {
    const out = generatePlan(baseInput);
    expect(out.plan['Spring 2027']).not.toContain(FALL_ONLY);
    expect(out.unplacedCourses).toContain(FALL_ONLY);
  });

  it('RELAXED (verifiedTerms set, spring-2027 unverified): course IS placed into the off-season spring', () => {
    const out = generatePlan({ ...baseInput, verifiedTerms });
    expect(out.plan['Spring 2027']).toContain(FALL_ONLY);
    expect(out.unplacedCourses).not.toContain(FALL_ONLY);
  });

  it('RELAXED but term IS verified: enforcement stays strict (course not placed in off-season)', () => {
    // Mark spring-2027 verified → the relaxation no longer applies, so the
    // fall-only course must stay unplaced just like the strict path.
    const allVerified = new Set(['spring-2027']);
    const out = generatePlan({ ...baseInput, verifiedTerms: allVerified });
    expect(out.plan['Spring 2027']).not.toContain(FALL_ONLY);
    expect(out.unplacedCourses).toContain(FALL_ONLY);
  });
});

// ─── #4 — auto-planner / Recommend still respects real offerings ──────────────

describe('TASK-081 #4 — auto-planner respects real offerings (unchanged)', () => {
  it('a fall-only course is never auto-placed into a non-fall term (real data)', () => {
    const currentPlan = Object.fromEntries(SEMESTERS.map((s) => [s.id, []]));

    const { plan } = generateAutoPlan({
      prereqGraph,
      offeringSchedule,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan,
      catalog,
      optimize: 'fastest',
    });

    // For every fall-only course in the offering schedule that the planner placed,
    // it must sit in a Fall term — the auto-planner never relaxes offerings.
    for (const sem of SEMESTERS) {
      for (const courseId of plan[sem.id] ?? []) {
        const seasons = getOfferedSeasons(courseId, offeringSchedule);
        if (seasons && seasons.length === 1 && seasons[0] === 'fall' && sem.status === 'future') {
          expect(canOfferInSemester(courseId, sem, offeringSchedule)).toBe(true);
          expect(sem.season).toBe('Fall');
        }
      }
    }
  });

  it('generateAutoPlan never passes verifiedTerms — strict by construction', () => {
    // Regression guard: AutoPlannerInput has no verifiedTerms field, so the
    // relaxation can never leak into Recommend. Asserted structurally here so a
    // future edit that threads it through is caught.
    const currentPlan = Object.fromEntries(SEMESTERS.map((s) => [s.id, []]));
    const result = generateAutoPlan({
      prereqGraph,
      offeringSchedule,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: SEMESTERS,
      currentPlan,
      catalog,
      optimize: 'fastest',
    });
    // Every future placement honors the strict offering predicate.
    for (const sem of SEMESTERS.filter((s) => s.status === 'future')) {
      for (const courseId of result.plan[sem.id] ?? []) {
        expect(canOfferInSemester(courseId, sem, offeringSchedule)).toBe(true);
      }
    }
  });
});
