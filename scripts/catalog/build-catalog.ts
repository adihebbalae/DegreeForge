#!/usr/bin/env node
/**
 * build-catalog.ts — regenerate course-catalog.json from the UT course feed
 * (TASK-catalog). LOCAL TRANSFORM of static data — NOT a live scrape.
 *
 * Reads:
 *   - Degree-Audit-Plus/assets/ut-courses.json  (per-SECTION rows, Fall 2026;
 *     ~10.7MB external source — gitignored, never committed)
 *   - packages/client/public/data/course-catalog.json  (existing hand-curated
 *     ECE/M catalog — AUTHORITATIVE, preserved verbatim)
 *
 * Writes:
 *   - packages/client/public/data/course-catalog.json  (existing entries
 *     untouched + a lean, prereq-free entry for every other unique UT course)
 *
 * Pipeline (all pure logic in catalog-transform.ts):
 *   sections → dedupRows (one entry per id) → mergeCatalog (existing wins) → write
 *
 * Run: npm run build:catalog   (or: npx tsx scripts/catalog/build-catalog.ts)
 */

import * as fs from 'fs';
import * as path from 'path';
import type { CourseCatalog } from '../../packages/client/src/types';
import {
  dedupRows,
  mergeCatalog,
  coreCounts,
  type UtCourseRow,
} from './catalog-transform';

// ─── Repo paths ───────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_PATH = path.join(REPO_ROOT, 'Degree-Audit-Plus', 'assets', 'ut-courses.json');
const CATALOG_PATH = path.join(
  REPO_ROOT,
  'packages',
  'client',
  'public',
  'data',
  'course-catalog.json'
);

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function main(): void {
  if (!fs.existsSync(SOURCE_PATH)) {
    console.error(`Source feed not found: ${SOURCE_PATH}`);
    console.error('This is the external (gitignored) UT course feed. Place it there and re-run.');
    process.exit(1);
  }

  const rows = readJson<UtCourseRow[]>(SOURCE_PATH);
  if (!Array.isArray(rows)) {
    console.error('Source feed is not a JSON array of section rows.');
    process.exit(1);
  }
  const existing = readJson<CourseCatalog>(CATALOG_PATH);

  const beforeCount = Object.keys(existing).length;
  const beforeBytes = fs.statSync(CATALOG_PATH).size;

  const deduped = dedupRows(rows);
  const { catalog, added, preserved } = mergeCatalog(existing, deduped);

  const json = JSON.stringify(catalog, null, 2) + '\n';
  fs.writeFileSync(CATALOG_PATH, json, 'utf8');

  const afterCount = Object.keys(catalog).length;
  const afterBytes = Buffer.byteLength(json, 'utf8');
  const counts = coreCounts(catalog);

  console.log('── build-catalog summary ──────────────────────────────');
  console.log(`source section rows:        ${rows.length}`);
  console.log(`unique courses in feed:     ${Object.keys(deduped).length}`);
  console.log(`existing catalog entries:   ${beforeCount}`);
  console.log(`  ...preserved (collision): ${preserved.length}`);
  console.log(`newly added entries:        ${added.length}`);
  console.log(`total catalog entries:      ${afterCount}`);
  console.log('');
  console.log(`file size: ${(beforeBytes / 1024).toFixed(0)} KB → ${(afterBytes / 1024).toFixed(0)} KB`);
  console.log('');
  console.log('core-category counts (whole catalog):');
  for (const [cat, n] of Object.entries(counts)) {
    console.log(`  ${cat.padEnd(16)} ${n}`);
  }

  const MB = afterBytes / (1024 * 1024);
  if (MB > 3) {
    console.warn('');
    console.warn(`WARNING: catalog is ${MB.toFixed(2)}MB (> 3MB). Consider trimming descriptions.`);
  }
}

main();
