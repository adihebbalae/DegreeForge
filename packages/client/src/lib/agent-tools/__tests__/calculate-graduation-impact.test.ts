import { describe, it, expect } from 'vitest';
import { calculateGraduationImpact } from '../calculate-graduation-impact';
import { FIXTURE_CTX } from './fixture';

describe('calculateGraduationImpact', () => {
  it('returns downstream blocked count for a course with dependents', () => {
    // M 408C → ECE 302, ECE 306 → ECE 312 → ECE 460N
    const result = calculateGraduationImpact(FIXTURE_CTX, { course_id: 'M 408C' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.downstream_blocked_count).toBeGreaterThan(0);
  });

  it('returns zero blocked count for a terminal course', () => {
    const result = calculateGraduationImpact(FIXTURE_CTX, { course_id: 'ECE 460N' });
    const content = result.content as Record<string, unknown>;
    expect(content.downstream_blocked_count).toBe(0);
  });

  it('returns error if course_id missing', () => {
    const result = calculateGraduationImpact(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });

  it('includes impact_summary string', () => {
    const result = calculateGraduationImpact(FIXTURE_CTX, { course_id: 'ECE 306' });
    const content = result.content as Record<string, unknown>;
    expect(typeof content.impact_summary).toBe('string');
  });
});
