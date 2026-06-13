/**
 * HomeLandingDashboard — TASK-076
 *
 * The home screen ("/") for the `landing-dashboard` variant (Direction 1 in
 * .agents/home-design-options.md). It branches on whether the user has onboarded
 * (the same `degreeforge:onboarded` flag main.tsx reads):
 *
 *   - first-time (not onboarded) → LandingHero: sells the wedge + onboarding CTAs.
 *   - returning (onboarded)      → ProgressDashboard: a calm progress summary,
 *     the next term, and quick actions into the planner.
 *
 * Takes no props; reads context only. The Manager wires this into HomeRoute's
 * variant map (this file does not touch HomeRoute).
 */

import { useOnboarded } from './useOnboarded';
import { LandingHero } from './LandingHero';
import { ProgressDashboard } from './ProgressDashboard';

export default function HomeLandingDashboard() {
  const onboarded = useOnboarded();
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background" data-testid="home-landing-dashboard">
      {onboarded ? <ProgressDashboard /> : <LandingHero />}
    </div>
  );
}
