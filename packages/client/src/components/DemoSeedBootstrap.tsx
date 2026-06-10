import { useEffect, useRef } from 'react';
import { fetchAndLoadDemo, useProfileDispatch } from '@/context/ProfileContext';
import { usePlanDispatch, SEMESTERS } from '@/context/PlanContext';
import { deriveTimelinePlanFromProfile } from '@/lib/derive-timeline';

interface DemoSeedBootstrapProps {
  /** True when this is a genuine first run (no profile stored before providers mounted). */
  isFirstRun: boolean;
}

/**
 * Mounted inside both ProfileProvider and PlanProvider. On a genuine first run
 * (isFirstRun===true) with VITE_SEED_DEMO_PROFILE===true, fetches the demo
 * profile and seeds both profile and timeline exactly once.
 *
 * Guards:
 * - isFirstRun must be true (detected at module scope in main.tsx before
 *   ProfileProvider persists the key).
 * - VITE_SEED_DEMO_PROFILE must be the string 'true'.
 * - A ref prevents double-fire in React StrictMode.
 */
export function DemoSeedBootstrap({ isFirstRun }: DemoSeedBootstrapProps) {
  const profileDispatch = useProfileDispatch();
  const planDispatch = usePlanDispatch();
  const firedRef = useRef(false);

  useEffect(() => {
    const shouldSeed =
      isFirstRun &&
      import.meta.env.VITE_SEED_DEMO_PROFILE === 'true' &&
      !firedRef.current;

    if (!shouldSeed) return;

    firedRef.current = true;

    fetchAndLoadDemo(profileDispatch).then((demo) => {
      const plan = deriveTimelinePlanFromProfile(demo, SEMESTERS);
      planDispatch({ type: 'SET_PLAN', plan });
    }).catch((err) => {
      // Non-fatal: dev server may not have public/data/user-profile.json ready.
      console.warn('[DemoSeedBootstrap] Failed to load demo profile:', err);
    });
  // Run exactly once on mount — deps intentionally empty.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
