import { describe, it, expect } from 'vitest';
import { getCourseInfo } from '../get-course-info';
import { FIXTURE_CTX } from './fixture';

describe('getCourseInfo', () => {
  it('returns course info for a known course', () => {
    const result = getCourseInfo(FIXTURE_CTX, { course_id: 'ECE 302' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.id).toBe('ECE 302');
    expect(content.title).toBeTruthy();
    expect(typeof content.credits).toBe('number');
    expect(content.avg_gpa).toBe(2.8);
  });

  it('returns error for unknown course', () => {
    const result = getCourseInfo(FIXTURE_CTX, { course_id: 'ECE 999' });
    expect(result.isError).toBe(true);
  });

  it('returns error if course_id is missing', () => {
    const result = getCourseInfo(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });

  it('uppercases the course_id lookup', () => {
    const result = getCourseInfo(FIXTURE_CTX, { course_id: 'ece 302' });
    expect(result.isError).toBeFalsy();
  });
});
