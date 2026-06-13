/**
 * useOnboarded — TASK-076
 *
 * Reads the same `degreeforge:onboarded` flag that main.tsx's OnboardingGate
 * uses to decide whether to show the wizard. The landing-dashboard home variant
 * branches on this: a first-time (un-onboarded) visitor gets the wedge hero, a
 * returning user gets the progress dashboard.
 *
 * Routed through the guarded localStorage read (safeGetRaw) so disabled storage
 * (Safari private mode, blocked cookies) can never throw here — it degrades to
 * "not onboarded" (show the hero), which is the safe default for a cold visitor.
 */

import { safeGetRaw } from '@/lib/persist';

/** localStorage key main.tsx writes after the onboarding wizard completes. */
export const ONBOARDED_KEY = 'degreeforge:onboarded';

/**
 * True once the user has finished onboarding (same semantics as main.tsx).
 * Read once at call time — the flag only flips during the wizard, which lives
 * above this component in the tree, so there is no in-session transition to track.
 */
export function useOnboarded(): boolean {
  return safeGetRaw(ONBOARDED_KEY) === 'true';
}
