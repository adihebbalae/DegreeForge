import { describe, it, expect } from 'vitest';
import { getPrereqs } from '../get-prereqs';
import { FIXTURE_CTX } from './fixture';

describe('getPrereqs', () => {
  it('returns prerequisites for ECE 306', () => {
    const result = getPrereqs(FIXTURE_CTX, { course_id: 'ECE 306' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.course_id).toBe('ECE 306');
    const prereqs = content.prerequisites as Array<{ id: string }>;
    expect(prereqs.some(p => p.id === 'M 408C')).toBe(true);
  });

  it('returns empty prerequisites for M 408C', () => {
    const result = getPrereqs(FIXTURE_CTX, { course_id: 'M 408C' });
    const content = result.content as Record<string, unknown>;
    expect((content.prerequisites as unknown[]).length).toBe(0);
  });

  it('returns error if course_id is missing', () => {
    const result = getPrereqs(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });
});
