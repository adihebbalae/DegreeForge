/**
 * ProgressPage — TASK-098 Increments 3-5 (replaces TASK-105 Phase 2 stub)
 *
 * The `/progress` route. Two behaviors:
 *
 *   fromUpload (router state set by OnboardingWizard on successful import):
 *     Renders the ProgressReveal wrapper — loading bar + skeleton shimmer for
 *     MIN_SHIMMER_MS, then cross-fades to the FR-4 radial+cards page with a
 *     success banner and a planner nudge CTA.
 *
 *   Direct nav (no router state / fromUpload not set):
 *     Renders the FR-4 radial+cards page directly without any shimmer or banner.
 *
 * ProgressAuditPage lives in its own file (ProgressAuditPage.tsx) so that
 * both this module and ProgressReveal can import it without a circular dep.
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { track } from '@/lib/analytics';
import { ProgressReveal } from '@/components/ProgressReveal';
import { ProgressAuditPage } from '@/pages/ProgressAuditPage';

export { ProgressAuditPage };

// ─── Route state validation ───────────────────────────────────────────────────

type UploadSource = 'transcript' | 'ida' | 'unknown';

interface UploadRouteState {
  fromUpload?: boolean;
  completed?: number;
  inProgress?: number;
  source?: string;
}

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

// ─── Default export ──────────────────────────────────────────────────────────

export default function ProgressPage() {
  const location = useLocation();
  const rawState = (location.state ?? {}) as UploadRouteState;

  // Fire analytics on direct nav (useEffect, not useMemo, so it runs exactly once
  // per mount and is safe under StrictMode — memo bodies may double-run).
  useEffect(() => {
    if (!rawState.fromUpload) {
      track('progress_tab_viewed');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Direct nav — no shimmer, no banner, just the radial+cards page.
  return (
    <div className="h-full min-h-0 overflow-y-auto bg-background">
      <ProgressAuditPage />
    </div>
  );
}
