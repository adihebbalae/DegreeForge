/**
 * syllabus-display.ts
 *
 * Pure helpers for rendering scraped past-syllabus data.
 * No React, no fetch — fully testable in isolation.
 *
 * Data-quality context:
 *   - Only 14 of 56 courses with grading arrays sum to a plausible 95–105%.
 *   - Textbook entries are frequently fragments of the same book.
 *   These helpers enforce the quality gates so the UI never shows bad data.
 */

// ─── Grading plausibility gate ────────────────────────────────────────────────

export const GRADING_PLAUSIBLE_MIN = 95;
export const GRADING_PLAUSIBLE_MAX = 105;

/**
 * Sum of all component percentages in a grading breakdown.
 */
export function gradingTotal(components: { pct: number }[]): number {
  return components.reduce((acc, c) => acc + c.pct, 0);
}

/**
 * Returns true iff the grading breakdown has at least 2 components AND
 * the component percentages sum to [GRADING_PLAUSIBLE_MIN, GRADING_PLAUSIBLE_MAX].
 *
 * This guards against partial extractions (e.g. ECE 306 = 44%) and
 * over-counted breakdowns (e.g. ECE 438 = 170%).
 */
export function isGradingPlausible(components: { pct: number }[]): boolean {
  if (components.length < 2) return false;
  const total = gradingTotal(components);
  return total >= GRADING_PLAUSIBLE_MIN && total <= GRADING_PLAUSIBLE_MAX;
}

// ─── Textbook deduplication ───────────────────────────────────────────────────

/**
 * Dedupes a list of textbook strings.
 *
 * Algorithm:
 *   1. Trim each entry.
 *   2. Case-insensitively drop any entry that is a substring of a longer
 *      entry already in the kept set (keep the longest variant).
 *   3. Cap the result to `cap` entries (default 3).
 *
 * This collapses common scrape artifacts where the same book appears as
 * multiple fragments (short title fragment + full citation).
 */
export function dedupeTextbooks(list: string[], cap = 3): string[] {
  const trimmed = list.slice(0, 100).map((s) => s.trim()).filter((s) => s.length > 0);

  const kept: string[] = [];

  for (const candidate of trimmed) {
    const candidateLower = candidate.toLowerCase();

    // Drop candidate if it is a substring of something already kept
    const isSubstringOfKept = kept.some((k) =>
      k.toLowerCase().includes(candidateLower) && k.length > candidate.length
    );
    if (isSubstringOfKept) continue;

    // Remove any already-kept entries that are substrings of this candidate
    const withoutSubstrings = kept.filter(
      (k) => !candidateLower.includes(k.toLowerCase()) || k === candidate
    );

    withoutSubstrings.push(candidate);
    kept.length = 0;
    kept.push(...withoutSubstrings);
  }

  return kept.slice(0, cap);
}
