import { describe, it, expect } from 'vitest';
import { listRemainingRequirements } from '../list-remaining-requirements';
import { FIXTURE_CTX } from './fixture';
import { buildSatisfiedSet } from '../../requirements';
import type { ToolContext } from '../types';

describe('listRemainingRequirements', () => {
  it('returns missing requirements fields', () => {
    const result = listRemainingRequirements(FIXTURE_CTX, {});
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(Array.isArray(content.missing_ece_core)).toBe(true);
    expect(Array.isArray(content.missing_math)).toBe(true);
    expect(Array.isArray(content.missing_physics)).toBe(true);
    expect(Array.isArray(content.missing_tech_core)).toBe(true);
  });

  it('marks satisfied courses as not missing', () => {
    // M 408C is completed in fixture
    const result = listRemainingRequirements(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    expect((content.missing_math as string[]).includes('M 408C')).toBe(false);
  });

  it('includes summary object', () => {
    const result = listRemainingRequirements(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    expect(content.summary).toBeDefined();
  });

  it('F: ECE 312H on the transcript satisfies the ECE 312 core requirement', () => {
    // Before the shared satisfied-set read model, the raw set had no variant
    // expansion and the tool listed ECE 312 as missing for an honors student.
    const profile: ToolContext['userProfile'] = {
      ...FIXTURE_CTX.userProfile,
      completed_courses: [
        { course: 'ECE 312H', title: 'Software Design (Honors)', grade: 'A', semester: 'Fall 2025', type: '', credit_hours: 3 },
      ],
      in_progress_courses: [],
    };
    const ctx: ToolContext = {
      ...FIXTURE_CTX,
      userProfile: profile,
      plan: {},
      satisfiedSet: buildSatisfiedSet(profile, FIXTURE_CTX.degreeRequirements, FIXTURE_CTX.semesters, {}, true),
    };

    const result = listRemainingRequirements(ctx, {});
    const content = result.content as Record<string, unknown>;
    expect(content.missing_ece_core as string[]).not.toContain('ECE 312');
    // Untaken core courses are still reported missing
    expect(content.missing_ece_core as string[]).toContain('ECE 302');
  });
});
