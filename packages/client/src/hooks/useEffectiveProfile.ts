/**
 * useEffectiveProfile
 *
 * Returns the user profile with `preferences.course_load_tolerance` overridden
 * by the value the user selected in Settings (SettingsContext.loadTolerance).
 *
 * The raw profile loaded from user-profile.json hardcodes a tolerance that is
 * never updated after initial load. All credit-cap consumers that run inside
 * React components should use this hook instead of `useUserProfile()` directly,
 * so every feature (diagnostics, Recommend, What-If ghost plan) agrees on the
 * same cap.
 *
 * Pure libs (auto-planner.ts, run-solver.ts) stay clean — their callers are
 * responsible for passing the effective profile or a derived override.
 */

import { useMemo } from 'react';
import { useUserProfile } from '@/context/DataContext';
import { useSettings } from '@/context/SettingsContext';
import type { UserProfile } from '@/types';

/**
 * Returns null while data is loading (mirrors useUserProfile's null-while-loading
 * contract), otherwise returns a UserProfile with course_load_tolerance set to
 * the user's currently selected Settings value.
 */
export function useEffectiveProfile(): UserProfile | null {
  const userProfile = useUserProfile();
  const { loadTolerance } = useSettings();

  return useMemo(() => {
    if (!userProfile) return null;
    return {
      ...userProfile,
      preferences: {
        ...userProfile.preferences,
        course_load_tolerance: loadTolerance,
      },
    };
  }, [userProfile, loadTolerance]);
}
