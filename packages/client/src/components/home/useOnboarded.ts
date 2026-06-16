/**
 * useOnboarded — TASK-076 / TASK-105
 *
 * Determines whether the current visitor has a stored plan/profile and should
 * be treated as a "returning user". Previously this read a `degreeforge:onboarded`
 * flag written by the wizard gate; since TASK-105 removed that gate, onboarded
 * state is now derived in this module from profile content. If a profile with
 * any meaningful field is stored in localStorage, the user is returning and should
 * see their progress dashboard.
 *
 * Derivation: a visitor is considered onboarded if their profile has a non-empty
 * name, at least one completed course, at least one in-progress course, OR a
 * graduation_target set. This correctly handles the "skipped import" case where
 * the wizard was completed but no courses were imported (graduation_target is set
 * but all course arrays are empty and name is blank).
 *
 * The Zod-guarded helper (safeGetItem + fromJson + parseProfileState) is reused
 * from ProfileProvider so this read path is consistent with the rest of the app.
 *
 * Degrades to false (show the hero) on any read error or when storage is unavailable,
 * which is the safe default for a cold visitor.
 *
 * Note: the legacy `degreeforge:onboarded` key may still exist in returning users'
 * localStorage from before TASK-105 — it is simply ignored now; no cleanup needed.
 */

import { safeGetItem, fromJson } from '@/lib/persist';
import { parseProfileState } from '@/lib/profile-schema';
import { PROFILE_STORAGE_KEY } from '@/context/ProfileContext';

/**
 * True when the visitor has a stored profile with any meaningful content:
 * name, completed_courses, in_progress_courses, or graduation_target set.
 * Returns false for a true first-timer (no stored profile) or on storage errors.
 */
export function useOnboarded(): boolean {
  const result = safeGetItem(PROFILE_STORAGE_KEY, fromJson(parseProfileState));
  if (result.status !== 'ok') return false;
  const p = result.value;
  const nameNonEmpty = p.name.trim().length > 0;
  const hasCompleted = p.completed_courses.length > 0;
  const hasInProgress = p.in_progress_courses.length > 0;
  const hasGradTarget = typeof p.graduation_target === 'string' && p.graduation_target.trim().length > 0;
  return nameNonEmpty || hasCompleted || hasInProgress || hasGradTarget;
}
