/**
 * offering-verification.ts
 *
 * TASK-081 — "unverified-offered" relaxation.
 *
 * We only have OBSERVED section data for the terms we actually scraped — those
 * listed in `sections-index.json`. For any future term OUTSIDE that observed
 * window (far future like Spring 2027+, or any term we never published a
 * sections file for), the season-offering pattern in offering-schedule.json is
 * UNVERIFIED: we can't confirm whether a course is or isn't offered that term.
 *
 * For unverified future terms we must NOT hard-block a manual placement — the
 * user may legitimately know about an offering we haven't scraped. We allow the
 * placement and surface a subtle "(unverified offered)" indicator instead.
 *
 * Verified future terms keep STRICT offering enforcement exactly as before, and
 * the deterministic auto-planner is unaffected (it never consults the verified
 * set — see solver.ts: relaxation only applies when `verifiedTerms` is threaded
 * through SolverInput, which only the manual path does).
 *
 * Pure TypeScript — no React, no I/O. The verified-term set is derived once from
 * the loaded SectionsIndex and threaded into the predicates, mirroring how
 * offeringSchedule is threaded everywhere else.
 */

import type { Semester, SectionsIndex, OfferingSchedule } from '../types';
import { isOfferingAllowed } from './solver';

/**
 * Convert a Semester to the term slug used in sections-index.json
 * (e.g. { season: 'Fall', year: 2026 } → "fall-2026").
 *
 * This is the canonical mapping between the planner's Semester objects and the
 * sections manifest's term slugs. Matches the slug format produced by the
 * sections scraper (scripts/sections/lib/term-codes.ts).
 */
export function semesterToTermSlug(semester: Semester): string {
  return `${semester.season.toLowerCase()}-${semester.year}`;
}

/**
 * Build the set of VERIFIED term slugs from the sections manifest.
 *
 * A term is "verified" iff it appears in sections-index.json#terms — i.e. we
 * actually scraped observed section data for it. Returns an empty set when the
 * manifest is null (still loading), which makes every future term unverified —
 * the safe / permissive default while data is loading.
 */
export function buildVerifiedTermSet(sectionsIndex: SectionsIndex | null): Set<string> {
  if (!sectionsIndex) return new Set<string>();
  return new Set(sectionsIndex.terms.map((t) => t.slug));
}

/**
 * True iff this semester's offering is VERIFIED — i.e. we have observed section
 * data for that exact term (it appears in sections-index.json).
 *
 * Unverified terms are everything else: far-future terms beyond our scrape
 * window, or any term we never published a sections file for.
 */
export function isOfferingVerifiedForTerm(
  semester: Semester,
  verifiedTerms: Set<string>
): boolean {
  return verifiedTerms.has(semesterToTermSlug(semester));
}

/**
 * Offering predicate for MANUAL placement (drag/drop, add, move) with the
 * unverified-term relaxation layered on top of the past-term relaxation.
 *
 * Rules, in order:
 *   - Past / current placement → always allowed (TASK-068; student already took it).
 *   - FUTURE + UNVERIFIED term → always allowed (we can't confirm the offering,
 *     so we don't hard-block; the UI flags it "(unverified offered)").
 *   - FUTURE + VERIFIED term → strict: defer to the real season-offering schedule
 *     exactly as before (verified enforcement unchanged).
 *
 * Use this ONLY on the manual path. The auto-planner / Recommend objective keeps
 * strict offering enforcement so recommended plans stay accurate.
 */
export function isOfferingAllowedForManualPlacement(
  courseId: string,
  semester: Semester,
  offeringSchedule: OfferingSchedule,
  verifiedTerms: Set<string>
): boolean {
  if (semester.status !== 'future') return true;
  if (!isOfferingVerifiedForTerm(semester, verifiedTerms)) return true;
  return isOfferingAllowed(courseId, semester, offeringSchedule);
}

/**
 * True iff a course placed in this semester should carry the "(unverified
 * offered)" indicator: the term is a FUTURE term we couldn't verify AND the
 * course's season-offering would otherwise NOT permit it there. We deliberately
 * do NOT flag courses that the verified schedule already allows — those are
 * genuinely offered as far as we know; the badge is reserved for placements that
 * only exist because verification was relaxed.
 */
export function isUnverifiedOfferingPlacement(
  courseId: string,
  semester: Semester,
  offeringSchedule: OfferingSchedule,
  verifiedTerms: Set<string>
): boolean {
  if (semester.status !== 'future') return false;
  if (isOfferingVerifiedForTerm(semester, verifiedTerms)) return false;
  // Only flag when the strict schedule would have blocked it — otherwise the
  // placement is unremarkable and needs no indicator.
  return !isOfferingAllowed(courseId, semester, offeringSchedule);
}
