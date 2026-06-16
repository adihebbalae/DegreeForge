/**
 * ProgressPage — TASK-105 Phase 2
 *
 * The `/progress` route. Two behaviors:
 *
 *   fromUpload (router state set by OnboardingWizard on successful import):
 *     Renders the ProgressReveal wrapper — loading bar + skeleton shimmer for
 *     MIN_SHIMMER_MS, then cross-fades to ProgressDashboard with a success banner
 *     and a planner nudge CTA.
 *
 *   Direct nav (no router state / fromUpload not set):
 *     Renders ProgressDashboard directly without any shimmer or banner. Sensible
 *     default for bookmarks, back-button, or future nav links.
 *
 * TASK-098 will replace ProgressDashboard with the FR-4 radial on this same
 * route — no changes needed here beyond swapping the import.
 */

import { useLocation } from 'react-router-dom';
import { ProgressDashboard } from '@/components/home/ProgressDashboard';
import { ProgressReveal } from '@/components/ProgressReveal';

interface UploadRouteState {
  fromUpload?: boolean;
  completed?: number;
  inProgress?: number;
  source?: string;
}

export default function ProgressPage() {
  const location = useLocation();
  const state = (location.state ?? {}) as UploadRouteState;

  if (state.fromUpload) {
    return (
      <ProgressReveal
        completed={state.completed ?? 0}
        inProgress={state.inProgress ?? 0}
        source={state.source ?? 'unknown'}
      />
    );
  }

  // Direct nav — no shimmer, no banner, just the dashboard.
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      <ProgressDashboard />
    </div>
  );
}
