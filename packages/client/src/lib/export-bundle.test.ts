/**
 * Tests for the v2 export/import bundle format introduced in TASK-044 Phase E.
 *
 * These tests exercise the pure parsing logic that Header.handleImport uses:
 *   - parsePlanState (plan extraction)
 *   - parseProfileState (profile extraction)
 *
 * The bundle-detection logic in Header is:
 *   const isV2Bundle = raw.version === 2 && raw.plan !== undefined
 *   const planRaw = isV2Bundle ? raw.plan : raw
 *
 * We mirror that logic here so tests remain decoupled from the React component.
 */
import { describe, it, expect } from 'vitest';
import { parsePlanState } from './plan-schema';
import { parseProfileState } from './profile-schema';
import type { UserProfile } from '../types';
import type { PlanState } from '../types';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const VALID_SEMESTER = {
  id: 'Fall 2026',
  label: "Fall '26",
  status: 'future' as const,
  year: 2026,
  season: 'Fall' as const,
};

const VALID_PLAN_STATE: PlanState = {
  semesters: [VALID_SEMESTER],
  plan: { 'Fall 2026': ['ECE 302'] },
  pinnedCourses: [],
  hoveredCourse: null,
  whatIf: { techCoreId: '', mathBAToggle: false, isActive: false },
  ghostCourses: {},
  rejectedGhosts: [],
  focusedGhostId: null,
  major: 'ece-bse',
  catalogYear: '2024',
};

const VALID_PROFILE: UserProfile = {
  name: 'Test Tester',
  eid: 'tt99999',
  university: 'The University of Texas at Austin',
  catalog_year: '2024',
  major: 'ece-bse',
  classification: 'Junior',
  first_semester: 'Fall 2025',
  graduation_target: 'Spring 2029',
  tech_core: { declared: '', status: '', required_math: '', required_ece: [], tech_electives_needed: 0 },
  secondary_aspirations: {
    math_ba: { status: '', notes: '' },
    advanced_math_cert: { status: '', notes: '' },
    jefferson_scholars_cert: { status: '', notes: '' },
  },
  preferences: { course_load: '', course_load_tolerance: 'above_average', time_preference: 'no_preference', summer_courses: false, summer_notes: '' },
  gpa: { cumulative: 3.8, lower_division: 3.8, upper_division: 0, gpa_hours: 30, grade_points: 114 },
  credit_summary: { total_hours_transferred: 0, total_hours_taken: 30, total_hours: 30 },
  completed_courses: [
    { course: 'ECE 302', title: 'Intro EE', grade: 'A', semester: 'Fall 2025', type: 'In residence', credit_hours: 3 },
  ],
  in_progress_courses: [],
  career_interests: ['hardware'],
  notes: '',
};

// ─── Helper: mirror the import-detection logic from Header ────────────────────

interface ParsedBundle {
  plan: PlanState | null;
  profile: UserProfile | null;
}

function parseImportBundle(raw: unknown): ParsedBundle {
  const obj = raw as Record<string, unknown>;
  const isV2Bundle = obj.version === 2 && obj.plan !== undefined;
  const planRaw = isV2Bundle ? obj.plan : raw;
  const plan = parsePlanState(planRaw);
  let profile: UserProfile | null = null;
  if (isV2Bundle && obj.profile !== undefined) {
    profile = parseProfileState(obj.profile);
  }
  return { plan, profile };
}

// ─── Export bundle shape ──────────────────────────────────────────────────────

describe('export bundle shape (v2)', () => {
  it('v2 bundle has version=2, plan, and profile fields', () => {
    // Simulate what Header.handleExport produces
    const bundle = { version: 2, plan: VALID_PLAN_STATE, profile: VALID_PROFILE };
    expect(bundle.version).toBe(2);
    expect(bundle.plan).toEqual(VALID_PLAN_STATE);
    expect(bundle.profile).toEqual(VALID_PROFILE);
  });

  it('serialises and deserialises round-trip without data loss', () => {
    const bundle = { version: 2, plan: VALID_PLAN_STATE, profile: VALID_PROFILE };
    const serialised = JSON.stringify(bundle);
    const deserialised = JSON.parse(serialised) as typeof bundle;
    expect(deserialised.version).toBe(2);
    expect(deserialised.plan.semesters[0].id).toBe('Fall 2026');
    expect(deserialised.profile.name).toBe('Test Tester');
    expect(deserialised.profile.completed_courses[0].course).toBe('ECE 302');
  });
});

// ─── v2 import — plan + profile both applied ──────────────────────────────────

describe('import v2 bundle', () => {
  it('detects a v2 bundle and returns both a valid plan and profile', () => {
    const raw = { version: 2, plan: VALID_PLAN_STATE, profile: VALID_PROFILE };
    const result = parseImportBundle(raw);
    expect(result.plan).not.toBeNull();
    expect(result.plan?.semesters[0].id).toBe('Fall 2026');
    expect(result.plan?.plan['Fall 2026']).toContain('ECE 302');
    expect(result.profile).not.toBeNull();
    expect(result.profile?.name).toBe('Test Tester');
    expect(result.profile?.completed_courses).toHaveLength(1);
  });

  it('applies profile data including completed_courses from v2 bundle', () => {
    const raw = { version: 2, plan: VALID_PLAN_STATE, profile: VALID_PROFILE };
    const result = parseImportBundle(raw);
    expect(result.profile?.eid).toBe('tt99999');
    expect(result.profile?.gpa.cumulative).toBe(3.8);
    expect(result.profile?.career_interests).toContain('hardware');
  });
});

// ─── Legacy v1 import (plan-only, no version field) ──────────────────────────

describe('import legacy v1 plan-only file', () => {
  it('imports a legacy plan-only file (no version field) without profile', () => {
    // v1 format: just the raw PlanState, no envelope
    const raw = VALID_PLAN_STATE;
    const result = parseImportBundle(raw);
    expect(result.plan).not.toBeNull();
    expect(result.plan?.semesters[0].id).toBe('Fall 2026');
    // No profile in a v1 file
    expect(result.profile).toBeNull();
  });

  it('imports a legacy plan-only file that has no version discriminant', () => {
    const legacy = {
      semesters: [VALID_SEMESTER],
      plan: { 'Fall 2026': ['M 427J'] },
    };
    const result = parseImportBundle(legacy);
    expect(result.plan).not.toBeNull();
    expect(result.plan?.plan['Fall 2026']).toContain('M 427J');
    expect(result.profile).toBeNull();
  });

  it('does not treat version=1 as a v2 bundle', () => {
    const v1Explicit = { version: 1, semesters: [VALID_SEMESTER], plan: { 'Fall 2026': [] } };
    const result = parseImportBundle(v1Explicit);
    // isV2Bundle=false, treats entire object as plan; parsePlanState will accept
    // because semesters and plan are present at top level
    expect(result.plan).not.toBeNull();
    expect(result.profile).toBeNull();
  });
});

// ─── Malformed-profile fallback ───────────────────────────────────────────────

describe('malformed profile in v2 bundle', () => {
  it('returns null profile but valid plan when profile field is invalid', () => {
    const raw = {
      version: 2,
      plan: VALID_PLAN_STATE,
      // Profile with structurally invalid completed_courses entry
      profile: { ...VALID_PROFILE, completed_courses: [null] },
    };
    const result = parseImportBundle(raw);
    // Plan still imported successfully
    expect(result.plan).not.toBeNull();
    expect(result.plan?.semesters[0].id).toBe('Fall 2026');
    // Profile gracefully skipped
    expect(result.profile).toBeNull();
  });

  it('returns null profile when profile field is a non-object', () => {
    const raw = { version: 2, plan: VALID_PLAN_STATE, profile: 'not-a-profile' };
    const result = parseImportBundle(raw);
    expect(result.plan).not.toBeNull();
    expect(result.profile).toBeNull();
  });

  it('returns null profile when profile field is null', () => {
    const raw = { version: 2, plan: VALID_PLAN_STATE, profile: null };
    const result = parseImportBundle(raw);
    expect(result.plan).not.toBeNull();
    expect(result.profile).toBeNull();
  });

  it('still imports plan when profile is entirely missing from v2 bundle', () => {
    const raw = { version: 2, plan: VALID_PLAN_STATE };
    const result = parseImportBundle(raw);
    expect(result.plan).not.toBeNull();
    expect(result.profile).toBeNull();
  });
});

// ─── Wholly invalid imports ───────────────────────────────────────────────────

describe('wholly invalid import files', () => {
  it('returns null plan for a v2 bundle with malformed plan', () => {
    const raw = { version: 2, plan: { invalid: true }, profile: VALID_PROFILE };
    const result = parseImportBundle(raw);
    expect(result.plan).toBeNull();
  });

  it('returns null plan for a non-object input', () => {
    const result = parseImportBundle('not json at all');
    expect(result.plan).toBeNull();
    expect(result.profile).toBeNull();
  });
});
