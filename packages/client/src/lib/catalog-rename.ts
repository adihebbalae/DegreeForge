/**
 * catalog-rename.ts
 *
 * Single source of truth for legacy-to-canonical catalog number mapping
 * (pre-2026 → 2026 catalog renumber).
 *
 * Imported by: variants.ts, progress.ts, requirements.ts
 */

/** Legacy (pre-2026) → canonical (2026+) catalog numbers. */
export const LEGACY_TO_CANONICAL: Record<string, string> = {
  'ECE 302': 'ECE 402',
  'ECE 306': 'ECE 406',
  'ECE 312': 'ECE 412',
  'ECE 319K': 'ECE 419K',
};
