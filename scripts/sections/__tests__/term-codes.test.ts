import { describe, it, expect } from 'vitest';
import { parseTermSlug } from '../lib/term-codes';

describe('parseTermSlug', () => {
  it('maps fall-2026 to UT semester code 20269', () => {
    expect(parseTermSlug('fall-2026')).toEqual({
      slug: 'fall-2026',
      label: 'Fall 2026',
      code: '20269',
      year: 2026,
      season: 'fall',
    });
  });

  it('maps spring-2027 to 20272', () => {
    expect(parseTermSlug('spring-2027').code).toBe('20272');
  });

  it('maps summer-2027 to 20276', () => {
    expect(parseTermSlug('summer-2027').code).toBe('20276');
  });

  it('lowercases and trims input', () => {
    expect(parseTermSlug('  Fall-2026  ').slug).toBe('fall-2026');
  });

  it('rejects malformed slugs', () => {
    expect(() => parseTermSlug('fall2026')).toThrow(/Invalid term slug/);
    expect(() => parseTermSlug('winter-2027')).toThrow(/Invalid term slug/);
    expect(() => parseTermSlug('fall-26')).toThrow(/Invalid term slug/);
    expect(() => parseTermSlug('')).toThrow(/Invalid term slug/);
  });
});
