import { describe, it, expect } from 'vitest';
import { getGradeDistribution } from '../get-grade-distribution';
import { FIXTURE_CTX } from './fixture';

describe('getGradeDistribution', () => {
  it('returns grade stats for a known course', () => {
    const result = getGradeDistribution(FIXTURE_CTX, { course_id: 'ECE 302' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.course_id).toBe('ECE 302');
    expect(content.avg_gpa).toBe(2.8);
    expect(typeof content.total_enrollment).toBe('number');
    expect(content.by_instructor).toBeDefined();
  });

  it('returns error for a course with no data', () => {
    const result = getGradeDistribution(FIXTURE_CTX, { course_id: 'ECE 999' });
    expect(result.isError).toBe(true);
  });

  it('returns error if course_id missing', () => {
    const result = getGradeDistribution(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });
});
