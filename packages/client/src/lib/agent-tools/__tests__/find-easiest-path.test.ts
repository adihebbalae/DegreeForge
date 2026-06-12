import { describe, it, expect } from 'vitest';
import { findEasiestPath } from '../find-easiest-path';
import { FIXTURE_CTX } from './fixture';
import { buildSatisfiedSet } from '../../requirements';
import type { ToolContext } from '../types';

describe('findEasiestPath', () => {
  it('returns prerequisite chain for ECE 460N', () => {
    const result = findEasiestPath(FIXTURE_CTX, { course_id: 'ECE 460N' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.course_id).toBe('ECE 460N');
    expect(typeof content.total_prereqs).toBe('number');
    expect(Array.isArray(content.remaining_prereqs)).toBe(true);
  });

  it('marks satisfied prereqs as not remaining', () => {
    // M 408C is completed in fixture
    const result = findEasiestPath(FIXTURE_CTX, { course_id: 'ECE 460N' });
    const content = result.content as Record<string, unknown>;
    const remaining = (content.remaining_prereqs as Array<{ id: string }>).map(r => r.id);
    expect(remaining).not.toContain('M 408C');
  });

  it('returns error if course_id missing', () => {
    const result = findEasiestPath(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });

  it('returns zero prereqs for a root course', () => {
    const result = findEasiestPath(FIXTURE_CTX, { course_id: 'M 408C' });
    const content = result.content as Record<string, unknown>;
    expect(content.total_prereqs).toBe(0);
  });

  it('F: a student who took ECE 312H is NOT told to take ECE 312', () => {
    // Honors variant on the transcript; nothing else planned. Before the
    // shared satisfied-set read model, the raw set had no variant expansion
    // and the tool recommended the non-honors form the student already has.
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

    const result = findEasiestPath(ctx, { course_id: 'ECE 460N' });
    const remaining = ((result.content as Record<string, unknown>).remaining_prereqs as Array<{ id: string }>).map(r => r.id);
    expect(remaining).not.toContain('ECE 312');
    // The chain's other prereqs are still genuinely remaining
    expect(remaining).toContain('ECE 306');
  });
});
