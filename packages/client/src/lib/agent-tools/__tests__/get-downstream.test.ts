import { describe, it, expect } from 'vitest';
import { getDownstreamTool } from '../get-downstream';
import { FIXTURE_CTX } from './fixture';

describe('getDownstreamTool', () => {
  it('returns all downstream courses for M 408C', () => {
    const result = getDownstreamTool(FIXTURE_CTX, { course_id: 'M 408C' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    const courses = (content.downstream_courses as Array<{ id: string }>).map(c => c.id);
    expect(courses).toContain('ECE 302');
    expect(courses).toContain('ECE 306');
    // Transitively downstream
    expect(courses).toContain('ECE 312');
    expect(courses).toContain('ECE 460N');
  });

  it('returns empty for a terminal course', () => {
    const result = getDownstreamTool(FIXTURE_CTX, { course_id: 'ECE 460N' });
    const content = result.content as Record<string, unknown>;
    expect((content.downstream_courses as unknown[]).length).toBe(0);
  });

  it('returns error if course_id missing', () => {
    const result = getDownstreamTool(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });
});
