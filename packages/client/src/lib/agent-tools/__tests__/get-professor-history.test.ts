import { describe, it, expect } from 'vitest';
import { getProfessorHistory } from '../get-professor-history';
import { FIXTURE_CTX } from './fixture';

describe('getProfessorHistory', () => {
  it('returns instructor stats for a course with byInstructor data', () => {
    const result = getProfessorHistory(FIXTURE_CTX, { course_id: 'ECE 302' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(Array.isArray(content.instructors)).toBe(true);
    expect((content.instructors as unknown[]).length).toBeGreaterThan(0);
    const first = (content.instructors as Array<{ instructor: string; avg_gpa: number }>)[0];
    expect(typeof first.instructor).toBe('string');
    expect(typeof first.avg_gpa).toBe('number');
  });

  it('sorts instructors by avg_gpa descending', () => {
    const result = getProfessorHistory(FIXTURE_CTX, { course_id: 'ECE 302' });
    const instructors = (result.content as Record<string, unknown>).instructors as Array<{ avg_gpa: number }>;
    expect(instructors[0].avg_gpa).toBeGreaterThanOrEqual(instructors[1].avg_gpa);
  });

  it('returns note for a course without instructor data', () => {
    const result = getProfessorHistory(FIXTURE_CTX, { course_id: 'ECE 306' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.note).toBeTruthy();
  });

  it('returns error if course_id missing', () => {
    const result = getProfessorHistory(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });
});
