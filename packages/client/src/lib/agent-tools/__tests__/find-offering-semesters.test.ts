import { describe, it, expect } from 'vitest';
import { findOfferingSemesters } from '../find-offering-semesters';
import { FIXTURE_CTX } from './fixture';

describe('findOfferingSemesters', () => {
  it('returns offering data for a known course', () => {
    const result = findOfferingSemesters(FIXTURE_CTX, { course_id: 'ECE 302' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.course_id).toBe('ECE 302');
    expect(Array.isArray(content.offered_semesters)).toBe(true);
    expect(content.offered_semesters).toContain('fall');
  });

  it('returns note for a course not in the offering schedule', () => {
    const result = findOfferingSemesters(FIXTURE_CTX, { course_id: 'ECE 999' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.offered_semesters).toEqual([]);
    expect(content.note).toBeTruthy();
  });

  it('returns error if course_id missing', () => {
    const result = findOfferingSemesters(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });
});
