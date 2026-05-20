import { describe, it, expect } from 'vitest';
import { findEasiestPath } from '../find-easiest-path';
import { FIXTURE_CTX } from './fixture';

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
});
