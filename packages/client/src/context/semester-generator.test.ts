import { describe, it, expect } from 'vitest';
import { generateSemesters, getCurrentTerm, SEMESTERS } from './PlanContext.constants';
import { validateOp } from '@/lib/plan-edit-validation';

// ─── generateSemesters unit tests ─────────────────────────────────────────────

describe('generateSemesters', () => {
  it('produces the correct interleaved sequence for AY2025-26 through AY2028-29', () => {
    const sems = generateSemesters(2025, 2029);
    const ids = sems.map((s) => s.id);
    expect(ids).toEqual([
      'Fall 2025',
      'Spring 2026',
      'Summer 2026',
      'Fall 2026',
      'Spring 2027',
      'Summer 2027',
      'Fall 2027',
      'Spring 2028',
      'Summer 2028',
      'Fall 2028',
      'Spring 2029',
    ]);
  });

  it('does not append a Summer term after the final Spring', () => {
    const sems = generateSemesters(2025, 2029);
    const last = sems[sems.length - 1];
    expect(last.id).toBe('Spring 2029');
    expect(last.season).toBe('Spring');
  });

  // Status is now derived from an injected clock (not frozen literals), so these
  // pin the classification at fixed dates rather than assuming "today".
  it('classifies past/current/future relative to a Spring clock', () => {
    const now = new Date(2026, 2, 15); // March 2026 → Spring 2026 is current
    const byId = Object.fromEntries(generateSemesters(2025, 2029, now).map((s) => [s.id, s]));
    expect(byId['Fall 2025'].status).toBe('past');
    expect(byId['Spring 2026'].status).toBe('current');
    expect(byId['Summer 2026'].status).toBe('future');
    expect(byId['Fall 2026'].status).toBe('future');
  });

  it('classifies relative to a Summer clock (the real-date case: Spring→past, Summer→current)', () => {
    const now = new Date(2026, 5, 12); // June 2026 → Summer 2026 is current
    const byId = Object.fromEntries(generateSemesters(2025, 2029, now).map((s) => [s.id, s]));
    expect(byId['Fall 2025'].status).toBe('past');
    expect(byId['Spring 2026'].status).toBe('past');
    expect(byId['Summer 2026'].status).toBe('current');
    expect(byId['Fall 2026'].status).toBe('future');
  });

  it('marks exactly one term current for any in-range clock', () => {
    const now = new Date(2027, 9, 1); // Oct 2027 → Fall 2027
    const sems = generateSemesters(2025, 2029, now);
    const current = sems.filter((s) => s.status === 'current');
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe('Fall 2027');
  });

  it('assigns correct season to each Summer term', () => {
    const sems = generateSemesters(2025, 2029);
    const summers = sems.filter((s) => s.season === 'Summer');
    expect(summers).toHaveLength(3); // Su'26, Su'27, Su'28
    for (const s of summers) {
      expect(s.season).toBe('Summer');
    }
  });

  it('assigns correct labels (Su \'YY for Summer terms)', () => {
    const sems = generateSemesters(2025, 2029);
    const byId = Object.fromEntries(sems.map((s) => [s.id, s]));
    expect(byId['Summer 2026'].label).toBe("Su '26");
    expect(byId['Summer 2027'].label).toBe("Su '27");
    expect(byId['Summer 2028'].label).toBe("Su '28");
  });

  it('Summer N belongs to year N (not N-1)', () => {
    const sems = generateSemesters(2025, 2029);
    const summer2026 = sems.find((s) => s.id === 'Summer 2026');
    expect(summer2026).toBeDefined();
    expect(summer2026!.year).toBe(2026);
  });
});

// ─── getCurrentTerm — injectable clock ─────────────────────────────────────────

describe('getCurrentTerm', () => {
  it('maps month to season (Jan–May Spring, Jun–Aug Summer, Sep–Dec Fall)', () => {
    expect(getCurrentTerm(new Date(2026, 0, 10))).toEqual({ season: 'Spring', year: 2026 }); // Jan
    expect(getCurrentTerm(new Date(2026, 4, 30))).toEqual({ season: 'Spring', year: 2026 }); // May
    expect(getCurrentTerm(new Date(2026, 5, 1))).toEqual({ season: 'Summer', year: 2026 });  // Jun
    expect(getCurrentTerm(new Date(2026, 7, 31))).toEqual({ season: 'Summer', year: 2026 }); // Aug
    expect(getCurrentTerm(new Date(2026, 8, 1))).toEqual({ season: 'Fall', year: 2026 });    // Sep
    expect(getCurrentTerm(new Date(2026, 11, 25))).toEqual({ season: 'Fall', year: 2026 });  // Dec
  });
});

// ─── SEMESTERS constant includes Summer terms ──────────────────────────────────

describe('SEMESTERS constant', () => {
  it('includes Summer 2026, Summer 2027, Summer 2028', () => {
    const ids = SEMESTERS.map((s) => s.id);
    expect(ids).toContain('Summer 2026');
    expect(ids).toContain('Summer 2027');
    expect(ids).toContain('Summer 2028');
  });

  it('maintains interleaved order (Summer comes between Spring N and Fall N)', () => {
    const ids = SEMESTERS.map((s) => s.id);
    const sp26 = ids.indexOf('Spring 2026');
    const su26 = ids.indexOf('Summer 2026');
    const fa26 = ids.indexOf('Fall 2026');
    expect(sp26).toBeLessThan(su26);
    expect(su26).toBeLessThan(fa26);
  });
});

// ─── validateOp accepts Summer semester when it exists in the semester list ────

describe('validateOp — Summer semester placement', () => {
  const CATALOG = {
    'ECE 306': { id: 'ECE 306' },
  };

  const PLAN: Record<string, string[]> = {
    'Fall 2025': [],
    'Spring 2026': [],
    'Summer 2026': [],
    'Fall 2026': [],
  };

  const SEMESTER_IDS_WITH_SUMMER = Object.keys(PLAN);

  it('accepts adding a course to a Summer semester that is in the plan', () => {
    const err = validateOp(
      { op: 'add', courseId: 'ECE 306', semesterId: 'Summer 2026' },
      CATALOG,
      SEMESTER_IDS_WITH_SUMMER,
      PLAN
    );
    expect(err).toBeNull();
  });

  it('rejects adding a course to a Summer semester not in the plan', () => {
    const err = validateOp(
      { op: 'add', courseId: 'ECE 306', semesterId: 'Summer 2099' },
      CATALOG,
      SEMESTER_IDS_WITH_SUMMER,
      PLAN
    );
    expect(err).not.toBeNull();
    expect(err!.reason).toContain('Summer 2099');
  });
});
