/**
 * useOnboarded — TASK-076 / TASK-105
 *
 * Determines whether the current visitor has a stored plan/profile and should
 * be treated as a "returning user". Previously this read a `degreeforge:onboarded`
 * flag written by the wizard gate; since TASK-105 removed that gate, onboarded
 * state is now re-derived from profile existence: if a non-empty profile is stored
 * in localStorage, the user is returning and should see their progress dashboard.
 *
 * Derivation: safeGetRaw(PROFILE_STORAGE_KEY) !== null means some profile JSON has
 * been persisted (ProfileProvider always writes on every change, so even EMPTY_PROFILE
 * gets written on first mount — but EMPTY_PROFILE has no completed_courses and a
 * blank name, so any session that ran the wizard or imported data will have a
 * non-trivially populated profile). We use a two-tier check:
 *   1. Is the profile key present? (null → never stored → true first-timer)
 *   2. Does the stored profile have any meaningful content? (name, completed_courses,
 *      or in_progress_courses non-empty → returning user)
 *
 * Degrades to false (show the hero) on any read error or when storage is unavailable,
 * which is the safe default for a cold visitor.
 */

import { safeGetRaw } from '@/lib/persist';
import { PROFILE_STORAGE_KEY } from '@/context/ProfileContext';

/**
 * The old wizard-gate key — kept as a named export so callers that reference it
 * (SettingsPage Re-run Onboarding) can clear it without hard-coding the string.
 * @deprecated No longer written by the gate; profile presence is the truth signal.
 */
export const ONBOARDED_KEY = 'degreeforge:onboarded';

/**
 * True when the visitor has a stored profile with meaningful content (name,
 * completed_courses, or in_progress_courses set). Returns false for a true
 * first-timer (no stored profile) or on storage errors.
 */
export function useOnboarded(): boolean {
  const raw = safeGetRaw(PROFILE_STORAGE_KEY);
  if (raw === null) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof parsed.name === 'string' ? parsed.name : '';
    const completed = Array.isArray(parsed.completed_courses) ? parsed.completed_courses : [];
    const inProgress = Array.isArray(parsed.in_progress_courses) ? parsed.in_progress_courses : [];
    return name.trim().length > 0 || completed.length > 0 || inProgress.length > 0;
  } catch {
    return false;
  }
}
