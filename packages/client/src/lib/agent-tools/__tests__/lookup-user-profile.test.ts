import { describe, it, expect } from 'vitest';
import { lookupUserProfile } from '../lookup-user-profile';
import { FIXTURE_CTX } from './fixture';

describe('lookupUserProfile', () => {
  it('returns profile fields', () => {
    const result = lookupUserProfile(FIXTURE_CTX, {});
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(content.name).toBe('Adi Test');
    expect(content.classification).toBe('Junior');
    expect(content.graduation_target).toBe('Spring 2029');
  });

  it('includes GPA and credit summary', () => {
    const result = lookupUserProfile(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    expect((content.gpa as Record<string, unknown>).cumulative).toBe(3.5);
    expect(content.credit_summary).toBeDefined();
  });

  it('includes career interests', () => {
    const result = lookupUserProfile(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    expect(Array.isArray(content.career_interests)).toBe(true);
  });
});
