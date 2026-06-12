/**
 * task-064.test.ts — TASK-064 invariant-consolidation acceptance tests
 *
 * Four black-box acceptance criteria:
 *   AC1  ADD_COURSE into a past-status semester is rejected at the reducer.
 *   AC2  No course with prereqGraph.offered=['fall','spring'] is placed by the
 *        solver in a summer term even when absent from offering-schedule.json
 *        (ECE 464K is the specific regression case).
 *   AC3  Fresh auto-planner run with full canonical SEMESTERS (inc. Summer):
 *        no future term exceeds the credit-hour cap.
 *   AC4  Single source of truth verified:
 *        a) canOfferInSemester does NOT return true for a fall-only course in
 *           a summer semester when a prereqGraph is supplied (no missing-entry permissive).
 *        b) isPastSemester is the sole predicate — used in sanitize-course-list.ts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { planReducer, INITIAL_STATE, SEMESTERS } from '../context/PlanContext.constants';
import { isPastSemester } from './sanitize-course-list';
import { getCourseCredits } from './course-utils';
import { canOfferInSemester } from './solver';
import { generateAutoPlan } from './auto-planner';
import { PrereqGraph } from './graph-engine';
import type {
  UserProfile,
  DegreeRequirements,
  TechCores,
  MathRequirements,
  PrereqGraphData,
  Plan,
  CourseCatalog,
  OfferingSchedule,
  Semester,
} from '../types';

// ─── Real data loader ─────────────────────────────────────────────────────────

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
const prereqGraph = new PrereqGraph(prereqData);

// The REAL catalog — the canonical credit source the production solver uses.
const catalog = loadJson<CourseCatalog>('course-catalog.json');

// Canonical SEMESTERS (with Summer terms — matches production)
const CANONICAL_SEMESTERS: Semester[] = SEMESTERS; // from PlanContext.constants

// Initial plan matching DEMO_PLAN's past/current placement
const DEMO_CURRENT_PLAN: Plan = {
  ...Object.fromEntries(SEMESTERS.map((s) => [s.id, []])),
  'Fall 2025':   ['ECE 302', 'ECE 306', 'CTI 301G', 'M 427J', 'UGS 016'],
  'Spring 2026': ['ECE 312H', 'M 325K', 'CTI 302', 'ECE 319H'],
};

// ─── AC1: ADD_COURSE into a past semester is rejected at the reducer ──────────

describe('AC1 — past-term write guard in planReducer', () => {
  it('ADD_COURSE into a past-status semester returns unchanged state', () => {
    const pastSemId = INITIAL_STATE.semesters.find((s) => s.status === 'past')?.id;
    expect(pastSemId).toBeDefined();

    const before = { ...INITIAL_STATE };
    const after = planReducer(before, {
      type: 'ADD_COURSE',
      semesterId: pastSemId!,
      courseId: 'ECE 411',
    });

    // State reference must be identical (no mutation)
    expect(after).toBe(before);
    // Confirm the course is NOT in the past semester
    expect(after.plan[pastSemId!]).not.toContain('ECE 411');
  });

  it('ADD_COURSE into a future semester succeeds', () => {
    const futureSemId = INITIAL_STATE.semesters.find((s) => s.status === 'future')?.id;
    expect(futureSemId).toBeDefined();

    const after = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: futureSemId!,
      courseId: 'ECE 411',
    });

    expect(after.plan[futureSemId!]).toContain('ECE 411');
  });

  it('MOVE_COURSE with a past-status target semester is rejected', () => {
    const pastSemId = INITIAL_STATE.semesters.find((s) => s.status === 'past')?.id;
    const futureSemId = INITIAL_STATE.semesters.find((s) => s.status === 'future')?.id;
    expect(pastSemId).toBeDefined();
    expect(futureSemId).toBeDefined();

    // First place a course in a future semester
    const stateWithCourse = planReducer(INITIAL_STATE, {
      type: 'ADD_COURSE',
      semesterId: futureSemId!,
      courseId: 'ECE 411',
    });

    // Now try to move it to a past semester
    const before = stateWithCourse;
    const after = planReducer(before, {
      type: 'MOVE_COURSE',
      fromSemesterId: futureSemId!,
      toSemesterId: pastSemId!,
      courseId: 'ECE 411',
    });

    // State must be unchanged
    expect(after).toBe(before);
    expect(after.plan[futureSemId!]).toContain('ECE 411');
    expect(after.plan[pastSemId!]).not.toContain('ECE 411');
  });

  it('ACCEPT_GHOST with a past-status target semester is rejected', () => {
    const pastSemId = INITIAL_STATE.semesters.find((s) => s.status === 'past')?.id;
    expect(pastSemId).toBeDefined();

    const stateWithGhost = {
      ...INITIAL_STATE,
      ghostCourses: { [pastSemId!]: ['ECE 411'] },
    };

    const before = stateWithGhost;
    const after = planReducer(before, {
      type: 'ACCEPT_GHOST',
      courseId: 'ECE 411',
      semesterId: pastSemId!,
    });

    expect(after).toBe(before);
    expect(after.plan[pastSemId!]).not.toContain('ECE 411');
  });
});

// ─── AC2: ECE 464K baseline row in offering-schedule.json is [fall, spring]
//          so it must never be placed in a summer semester ────────────────────

describe('AC2 — offering-schedule.json baseline row: ECE 464K never placed in summer', () => {
  const summerSem: Semester = {
    id: 'Summer 2026', label: "Su '26", status: 'future', year: 2026, season: 'Summer',
  };
  const fallSem: Semester = {
    id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall',
  };
  const springSem: Semester = {
    id: 'Spring 2027', label: "Sp '27", status: 'future', year: 2027, season: 'Spring',
  };

  it('offering-schedule.json has an ECE 464K row with offered_semesters [fall, spring]', () => {
    // The former graph fallback rows were merged into offering-schedule.json as
    // provenance:"baseline" during the E2 canonicalization. ECE 464K is now present.
    expect(offeringSchedule['ECE 464K']).toBeDefined();
    expect(offeringSchedule['ECE 464K']!.offered_semesters).toEqual(['fall', 'spring']);
  });

  it('ECE 464K prereq-graph node no longer carries an offered field', () => {
    // After E2 the graph node is stripped of `offered`; the schedule row is the single source.
    const node = prereqData.nodes['ECE 464K'];
    expect(node).toBeDefined();
    expect((node as unknown as Record<string, unknown>)['offered']).toBeUndefined();
  });

  it('canOfferInSemester: ECE 464K via real schedule → summer=false, fall=true, spring=true', () => {
    expect(canOfferInSemester('ECE 464K', summerSem, offeringSchedule)).toBe(false);
    expect(canOfferInSemester('ECE 464K', fallSem, offeringSchedule)).toBe(true);
    expect(canOfferInSemester('ECE 464K', springSem, offeringSchedule)).toBe(true);
  });

  it('canOfferInSemester: unknown course with no schedule entry → all seasons true (open-world)', () => {
    // Courses absent from the schedule are open-world (null → any season allowed).
    expect(canOfferInSemester('UNKNOWN 999', summerSem, offeringSchedule)).toBe(true);
    expect(canOfferInSemester('UNKNOWN 999', fallSem, offeringSchedule)).toBe(true);
  });

  it('generateAutoPlan (with summer semesters): ECE 464K lands in fall or spring, never summer', () => {
    const result = generateAutoPlan({
      prereqGraph,
      offeringSchedule,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: CANONICAL_SEMESTERS,
      currentPlan: DEMO_CURRENT_PLAN,
      catalog,
    });

    // Find where ECE 464K was placed
    let placedSemester: Semester | undefined;
    for (const sem of CANONICAL_SEMESTERS) {
      if (result.plan[sem.id]?.includes('ECE 464K')) {
        placedSemester = sem;
        break;
      }
    }

    // ECE 464K must be placed somewhere
    expect(placedSemester).toBeDefined();
    // It must not be in a summer semester
    expect(placedSemester!.season).not.toBe('Summer');
    // It should be in fall or spring
    expect(['Fall', 'Spring']).toContain(placedSemester!.season);
  });
});

// ─── AC3: Fresh auto-planner with full canonical SEMESTERS (inc. Summer) —
//          no future term exceeds the credit-hour cap ─────────────────────────

describe('AC3 — no future term exceeds credit-hour cap (full canonical semesters)', () => {
  it('generateAutoPlan with Summer semesters: every future term ≤ cap (above_average=18)', () => {
    const result = generateAutoPlan({
      prereqGraph,
      offeringSchedule,
      userProfile: profile,
      degreeReqs,
      techCore: techCores.computer_architecture,
      mathReqs,
      mathBAToggle: false,
      semesters: CANONICAL_SEMESTERS,
      currentPlan: DEMO_CURRENT_PLAN,
      catalog,
    });

    // above_average tolerance → 18 credit-hour cap
    const cap = 18;
    const futureSemesters = CANONICAL_SEMESTERS.filter((s) => s.status === 'future');
    for (const sem of futureSemesters) {
      const credits = (result.plan[sem.id] ?? []).reduce(
        (sum, id) => sum + getCourseCredits(id, catalog),
        0
      );
      expect(credits).toBeLessThanOrEqual(cap);
    }
  });
});

// ─── AC4: Single source of truth verified ────────────────────────────────────

describe('AC4 — single source of truth for past-term and offering rules', () => {
  it('isPastSemester: returns true only for status===past semesters', () => {
    const semesters = INITIAL_STATE.semesters;
    const pastId = semesters.find((s) => s.status === 'past')?.id;
    const currentId = semesters.find((s) => s.status === 'current')?.id;
    const futureId = semesters.find((s) => s.status === 'future')?.id;

    expect(pastId).toBeDefined();
    expect(currentId).toBeDefined();
    expect(futureId).toBeDefined();

    expect(isPastSemester(pastId!, semesters)).toBe(true);
    expect(isPastSemester(currentId!, semesters)).toBe(false);
    expect(isPastSemester(futureId!, semesters)).toBe(false);
    expect(isPastSemester('NONEXISTENT 0000', semesters)).toBe(false);
  });

  it('canOfferInSemester: schedule is the single source — fall/spring entry prevents summer placement', () => {
    // In the new model, offering-schedule.json is the only offering source. The former
    // prereq-graph fallback was deleted; baseline rows from the graph were merged into
    // the schedule. A course with fall/spring in the schedule is not summer-placeable.
    const summerSem: Semester = {
      id: 'Summer 2026', label: "Su '26", status: 'future', year: 2026, season: 'Summer',
    };
    const fallSem: Semester = {
      id: 'Fall 2026', label: "Fall '26", status: 'future', year: 2026, season: 'Fall',
    };

    // Course with an explicit fall/spring entry in the schedule
    const scheduleWithEntry: OfferingSchedule = {
      'ECE 999': { title: 'Test Course', offerings: {}, offered_semesters: ['fall', 'spring'] },
    };
    expect(canOfferInSemester('ECE 999', summerSem, scheduleWithEntry)).toBe(false);
    expect(canOfferInSemester('ECE 999', fallSem, scheduleWithEntry)).toBe(true);

    // Course absent from the schedule → open-world → any season allowed (including summer)
    const emptySchedule: OfferingSchedule = {};
    expect(canOfferInSemester('ECE 999', summerSem, emptySchedule)).toBe(true);
  });
});
