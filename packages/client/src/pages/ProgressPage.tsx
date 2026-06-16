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

type UploadSource = 'transcript' | 'ida' | 'unknown';

interface UploadRouteState {
  fromUpload?: boolean;
  completed?: number;
  inProgress?: number;
  source?: string;
}

/** Validate and coerce raw router state before passing to ProgressReveal.
 *  Defense against arbitrary history.pushState polluting analytics. */
function validateRouteState(raw: unknown): {
  source: UploadSource;
  completed: number;
  inProgress: number;
} {
  const s = (raw != null && typeof raw === 'object' ? raw : {}) as UploadRouteState;

  const VALID_SOURCES: UploadSource[] = ['transcript', 'ida', 'unknown'];
  const source: UploadSource =
    typeof s.source === 'string' && VALID_SOURCES.includes(s.source as UploadSource)
      ? (s.source as UploadSource)
      : 'unknown';

  const toCount = (x: unknown): number =>
    typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0;

  return {
    source,
    completed: toCount(s.completed),
    inProgress: toCount(s.inProgress),
  };
}

export default function ProgressPage() {
  const location = useLocation();
  const rawState = (location.state ?? {}) as UploadRouteState;

  if (rawState.fromUpload) {
    const { source, completed, inProgress } = validateRouteState(location.state);
    return (
      <ProgressReveal
        completed={completed}
        inProgress={inProgress}
        source={source}
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
