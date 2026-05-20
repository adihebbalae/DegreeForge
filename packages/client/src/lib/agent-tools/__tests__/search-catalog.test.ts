import { describe, it, expect } from 'vitest';
import { searchCatalog } from '../search-catalog';
import { FIXTURE_CTX } from './fixture';

describe('searchCatalog', () => {
  it('finds courses matching a keyword', () => {
    const result = searchCatalog(FIXTURE_CTX, { query: 'calculus' });
    expect(result.isError).toBeFalsy();
    const content = result.content as Record<string, unknown>;
    const results = content.results as Array<{ id: string }>;
    expect(results.some(r => r.id === 'M 408C')).toBe(true);
  });

  it('returns empty results for a non-matching query', () => {
    const result = searchCatalog(FIXTURE_CTX, { query: 'xyznotacourse999' });
    const content = result.content as Record<string, unknown>;
    expect((content.results as unknown[]).length).toBe(0);
  });

  it('filters by department', () => {
    const result = searchCatalog(FIXTURE_CTX, { query: 'design', department: 'ECE' });
    const content = result.content as Record<string, unknown>;
    const results = content.results as Array<{ id: string }>;
    expect(results.every(r => r.id.startsWith('ECE'))).toBe(true);
  });

  it('returns error if query is missing', () => {
    const result = searchCatalog(FIXTURE_CTX, {});
    expect(result.isError).toBe(true);
  });
});
