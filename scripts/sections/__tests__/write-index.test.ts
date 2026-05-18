import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { upsertIndex } from '../lib/write-index';
import { parseTermSlug } from '../lib/term-codes';

function tmpIndexPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'degreeforge-idx-'));
  return path.join(dir, 'sections-index.json');
}

describe('upsertIndex', () => {
  let indexPath: string;

  beforeEach(() => {
    indexPath = tmpIndexPath();
  });

  it('creates a fresh manifest if none exists', () => {
    const idx = upsertIndex(indexPath, parseTermSlug('fall-2026'), 'fall-2026.json');
    expect(idx.terms).toHaveLength(1);
    expect(idx.default_term).toBe('fall-2026');
    expect(idx.terms[0]).toEqual({
      slug: 'fall-2026',
      label: 'Fall 2026',
      code: '20269',
      file: 'fall-2026.json',
    });
  });

  it('appends new terms and sorts newest-first', () => {
    upsertIndex(indexPath, parseTermSlug('fall-2026'), 'fall-2026.json');
    const idx = upsertIndex(indexPath, parseTermSlug('spring-2027'), 'spring-2027.json');
    expect(idx.terms.map((t) => t.slug)).toEqual(['spring-2027', 'fall-2026']);
    expect(idx.default_term).toBe('spring-2027');
  });

  it('upserts (does not duplicate) when the same term is written twice', () => {
    upsertIndex(indexPath, parseTermSlug('fall-2026'), 'fall-2026.json');
    const idx = upsertIndex(indexPath, parseTermSlug('fall-2026'), 'fall-2026.json');
    expect(idx.terms).toHaveLength(1);
  });

  it('recovers from corrupt JSON by starting fresh', () => {
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(indexPath, '{ this is not json', 'utf-8');
    const idx = upsertIndex(indexPath, parseTermSlug('fall-2026'), 'fall-2026.json');
    expect(idx.terms).toHaveLength(1);
    expect(idx.default_term).toBe('fall-2026');
  });
});
