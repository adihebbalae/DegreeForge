/**
 * past-drop — predicate for the planner's drag-onto-past-semester UX.
 *
 * Dropping a course into a PAST (completed / "record mode") semester is
 * intentionally a no-op: the PlanContext reducer's isPastSemester guard rejects
 * ADD_COURSE / MOVE_COURSE into a past term. That rejection used to be silent,
 * so users thought drag-and-drop was broken. The planner uses this predicate to
 * decide when to surface an explanatory notice INSTEAD of the silent no-op.
 *
 * This does NOT change what's allowed — the reducer guard remains the single
 * source of truth (see lib/sanitize-course-list.ts isPastSemester). This only
 * decides when to explain the rejection.
 */
import type { Semester } from '../types';
import { isPastSemester } from './sanitize-course-list';

/** The two drag sources the planner recognizes on drop. */
export type DragSource = 'palette' | 'timeline';

/**
 * Returns true when a drop should be intercepted with the "past semester is
 * read-only" notice rather than silently dropped by the reducer.
 *
 * It's a blocked past-drop when the target is a past term AND the drop would
 * otherwise mutate that term:
 *  - a palette add (ADD_COURSE), or
 *  - a timeline move from a DIFFERENT semester (MOVE_COURSE).
 *
 * A same-semester reorder within a past term is harmless (the reducer allows
 * REORDER_SEMESTER) and is NOT treated as blocked.
 *
 * @param toSemesterId  - resolved drop-target semester id
 * @param source        - where the dragged card came from
 * @param fromSemesterId - origin semester id for a timeline drag (undefined for palette)
 * @param semesters     - full semester list from plan state
 */
export function isBlockedPastDrop(
  toSemesterId: string,
  source: DragSource,
  fromSemesterId: string | undefined,
  semesters: Semester[],
): boolean {
  if (!isPastSemester(toSemesterId, semesters)) return false;
  if (source === 'palette') return true;
  return source === 'timeline' && fromSemesterId !== toSemesterId;
}

/**
 * Whether the "Reverse a semester" action (RETREAT_SEMESTER) can run: there
 * must be a current term with a past term somewhere before it to retreat into.
 * Mirrors the same guard in the reducer and the Header's ⋯ More menu so the
 * notice can fall back to a pointer ("⋯ → Reverse Semester") when it can't.
 */
export function canReverseSemester(semesters: Semester[]): boolean {
  const currentIdx = semesters.findIndex((s) => s.status === 'current');
  if (currentIdx === -1) return false;
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (semesters[i].status === 'past') return true;
  }
  return false;
}
