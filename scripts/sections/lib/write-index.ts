/**
 * Maintain `sections-index.json` so the client can discover available terms
 * without hard-coding a filename in DataContext.
 *
 * Schema:
 *   {
 *     "default_term": "fall-2026",
 *     "terms": [
 *       { "slug": "fall-2026", "label": "Fall 2026", "code": "20269", "file": "fall-2026.json" }
 *     ]
 *   }
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ParsedTerm } from './term-codes';

export interface TermIndexEntry {
  slug: string;
  label: string;
  code: string;
  file: string;
}

export interface SectionsIndex {
  default_term: string;
  terms: TermIndexEntry[];
}

function termOrder(a: TermIndexEntry, b: TermIndexEntry): number {
  // Sort by code descending (newer terms first). "20272" > "20269" lexically
  // works because all codes share width 5.
  if (a.code < b.code) return 1;
  if (a.code > b.code) return -1;
  return 0;
}

export function upsertIndex(
  indexPath: string,
  term: ParsedTerm,
  file: string
): SectionsIndex {
  let current: SectionsIndex = { default_term: term.slug, terms: [] };

  if (fs.existsSync(indexPath)) {
    try {
      current = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as SectionsIndex;
      if (!Array.isArray(current.terms)) current.terms = [];
      if (typeof current.default_term !== 'string') current.default_term = term.slug;
    } catch {
      // Corrupt file — start fresh rather than half-merge
      current = { default_term: term.slug, terms: [] };
    }
  }

  const entry: TermIndexEntry = {
    slug: term.slug,
    label: term.label,
    code: term.code,
    file,
  };

  current.terms = current.terms.filter((t) => t.slug !== term.slug);
  current.terms.push(entry);
  current.terms.sort(termOrder);

  // The most-recent term becomes the default; users can override by editing
  // sections-index.json manually if they want to pin an older default.
  current.default_term = current.terms[0]?.slug ?? term.slug;

  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(current, null, 2), 'utf-8');
  return current;
}
