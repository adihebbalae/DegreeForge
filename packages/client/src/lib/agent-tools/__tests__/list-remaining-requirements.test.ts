import { describe, it, expect } from 'vitest';
import { listRemainingRequirements } from '../list-remaining-requirements';
import { FIXTURE_CTX } from './fixture';

describe('listRemainingRequirements', () => {
  it('returns missing requirements fields', () => {
    const result = listRemainingRequirements(FIXTURE_CTX, {});
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    expect(Array.isArray(content.missing_ece_core)).toBe(true);
    expect(Array.isArray(content.missing_math)).toBe(true);
    expect(Array.isArray(content.missing_physics)).toBe(true);
    expect(Array.isArray(content.missing_tech_core)).toBe(true);
  });

  it('marks satisfied courses as not missing', () => {
    // M 408C is completed in fixture
    const result = listRemainingRequirements(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    expect((content.missing_math as string[]).includes('M 408C')).toBe(false);
  });

  it('includes summary object', () => {
    const result = listRemainingRequirements(FIXTURE_CTX, {});
    const content = result.content as Record<string, unknown>;
    expect(content.summary).toBeDefined();
  });
});
