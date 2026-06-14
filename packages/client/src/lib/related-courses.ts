/**
 * related-courses.ts — FR6 "You may also like" course recommender (TASK-082)
 *
 * Pure, deterministic course-similarity over the UT ECE technical-core data
 * (`tech-cores.json`, loaded as `TechCores`). NO LLM, no network, no randomness.
 *
 * The model of "related" is membership in the same technical-core area:
 * two courses are related when they belong to the same of the 8 ECE tech cores
 * (5 EE + 3 CompE, plus the catch-all "General Electrical Engineering" track).
 * Membership is read from each core's required-course slots and elective pool —
 * the authoritative per-core course lists transcribed from the catalog's
 * "Upper-Division Technical Component Areas" (see
 * `.agents/research/ut-ece-site-corpus.md` Section 2).
 *
 * When a course is in no core (e.g. a lower-division core course like ECE 302),
 * recommendations fall back to nearby same-prefix courses that DO appear in the
 * tech-core data, so a title is always resolvable and the result stays bounded.
 */

import type { TechCores, TechCoreTrack, TechCoreCourseEntry } from '../types';
import { isTechCorePickOne } from '../types';
import { parseCourseId } from './sanitize-course-list';

/** A single recommendation: the related course plus a short human reason. */
export interface RelatedCourse {
  /** Course id, e.g. "ECE 438". */
  course: string;
  /** Short reason shown in the UI, e.g. "Also in Electronics and Integrated Circuits". */
  reason: string;
}

/** Upper bound on how many recommendations `getRelatedCourses` returns. */
export const MAX_RELATED = 8;

/**
 * Collect every course id referenced anywhere in a single tech-core track:
 * the advanced-math slot, each core slot (single or pick-one options), the
 * core lab (single or pick-one), the required elective(s), and the full
 * elective pool. Order is deterministic (declaration order), de-duplicated.
 */
function coursesInTrack(track: TechCoreTrack): string[] {
  const ids: string[] = [];
  const push = (id: string | undefined): void => {
    if (id && !ids.includes(id)) ids.push(id);
  };
  const pushEntry = (entry: TechCoreCourseEntry | undefined): void => {
    if (!entry) return;
    if (isTechCorePickOne(entry)) {
      for (const opt of entry.options) push(opt.id);
    } else {
      push(entry.id);
    }
  };

  const req = track.required_courses;
  pushEntry(req.advanced_math);
  for (const slot of req.core ?? []) pushEntry(slot);
  pushEntry(req.core_lab);
  pushEntry(req.required_elective);
  // Some tracks carry an extra named required-elective slot (e.g. data_science).
  // It is not in the typed surface, so read it defensively without `any`.
  const extra = (req as Record<string, unknown>)['required_elective_2'];
  if (extra && typeof extra === 'object') {
    pushEntry(extra as TechCoreCourseEntry);
  }

  for (const id of track.elective_pool) push(id);
  return ids;
}

/** True iff `courseId` is referenced anywhere in `track`. */
function trackContains(track: TechCoreTrack, courseId: string): boolean {
  return coursesInTrack(track).includes(courseId);
}

/**
 * Same-prefix fallback: courses with the same department prefix as `courseId`
 * that appear somewhere in the tech-core data, ordered by absolute distance in
 * course number (nearest first), ties broken by ascending number then id.
 * Used only when the course belongs to no core.
 */
function nearbyByPrefix(
  courseId: string,
  techCores: TechCores
): RelatedCourse[] {
  const target = parseCourseId(courseId);
  if (!target) return [];

  const seen = new Set<string>();
  const candidates: { id: string; number: number }[] = [];
  for (const track of Object.values(techCores)) {
    for (const id of coursesInTrack(track)) {
      if (id === courseId || seen.has(id)) continue;
      const parsed = parseCourseId(id);
      if (!parsed || parsed.prefix !== target.prefix) continue;
      seen.add(id);
      candidates.push({ id, number: parsed.number });
    }
  }

  candidates.sort((a, b) => {
    const da = Math.abs(a.number - target.number);
    const db = Math.abs(b.number - target.number);
    if (da !== db) return da - db;
    if (a.number !== b.number) return a.number - b.number;
    return a.id.localeCompare(b.id);
  });

  return candidates.slice(0, MAX_RELATED).map((c) => ({
    course: c.id,
    reason: `Nearby ${target.prefix} course`,
  }));
}

/**
 * Recommend courses related to `courseId`, deterministically.
 *
 * Primary signal: other courses in the SAME technical-core area(s) as the input.
 * A course that sits in multiple cores contributes from each; the result is
 * de-duplicated (first reason wins) and capped at {@link MAX_RELATED}.
 *
 * Fallback: a course in no core returns nearby same-prefix courses (small set,
 * possibly empty). Never throws — an unknown id or empty data yields `[]`.
 *
 * @param courseId  the course the user is viewing, e.g. "ECE 438"
 * @param techCores the tech-cores record (from `useTechCoresRecord()`); may be null
 */
export function getRelatedCourses(
  courseId: string,
  techCores: TechCores | null
): RelatedCourse[] {
  if (!courseId || !techCores) return [];

  const containingTracks: TechCoreTrack[] = [];
  for (const track of Object.values(techCores)) {
    if (trackContains(track, courseId)) containingTracks.push(track);
  }

  if (containingTracks.length === 0) {
    return nearbyByPrefix(courseId, techCores);
  }

  // Gather co-members across every core the course belongs to. Iterate tracks
  // in declaration order; within a track keep declaration order. First time we
  // see a course, record it with that core's reason.
  const results: RelatedCourse[] = [];
  const seen = new Set<string>([courseId]);
  for (const track of containingTracks) {
    for (const id of coursesInTrack(track)) {
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({ course: id, reason: `Also in ${track.name}` });
    }
  }

  return results.slice(0, MAX_RELATED);
}
