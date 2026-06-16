/**
 * ProgressReveal — TASK-105 Phase 2
 *
 * Wraps ProgressAuditPage in an upload-reward reveal flow:
 *   1. Shows an indeterminate animated loading bar + skeleton shimmer for a
 *      minimum of MIN_SHIMMER_MS (~800 ms). Parsing is client-side sync/fast,
 *      so the floor prevents an imperceptible flash.
 *   2. After the floor elapses, cross-fades to ProgressAuditPage with a warm
 *      success banner: "N completed · M in progress loaded!"
 *   3. A prominent nudge CTA routes to the planner and fires upload_reward_nudge_clicked.
 *
 * The fallback for direct nav (no fromUpload state) lives in ProgressPage.tsx,
 * which renders ProgressAuditPage directly without this wrapper.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressAuditPage } from '@/pages/ProgressAuditPage';
import { track } from '@/lib/analytics';

// Minimum shimmer display time in ms. Parsing is sync + fast; without a floor
// the reveal would flash and feel like a glitch rather than a reward moment.
export const MIN_SHIMMER_MS = 800;

interface ProgressRevealProps {
  /** Total completed courses parsed from the import. */
  completed: number;
  /** Total in-progress courses parsed from the import. */
  inProgress: number;
  /** Import source used ('transcript' | 'ida'). */
  source: string;
}

/** Skeleton placeholder that mirrors ProgressAuditPage's radial + cards layout. */
function RevealSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-5xl px-6 py-8"
      data-testid="progress-reveal-skeleton"
    >
      {/* Title bar skeleton */}
      <div className="mb-6 flex items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
        <div className="h-5 w-44 animate-pulse rounded bg-muted" />
      </div>

      {/* Hero: pulsing radial circle + legend rows */}
      <div className="mb-8 flex flex-col items-center gap-6 lg:flex-row lg:items-start">
        <div className="h-[220px] w-[220px] flex-none animate-pulse rounded-full bg-muted" />
        <div className="flex-1 space-y-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
                <div className="h-3 w-28 animate-pulse rounded bg-muted" />
                <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
              </div>
              <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
            </div>
          ))}
        </div>
      </div>

      {/* Cards grid skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

export function ProgressReveal({ completed, inProgress, source }: ProgressRevealProps) {
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRevealed(true);
      track('upload_reward_shown', { completed, inProgress, source });
    }, MIN_SHIMMER_MS);
    return () => clearTimeout(timer);
  }, [completed, inProgress, source]);

  const handleNudge = () => {
    track('upload_reward_nudge_clicked');
    navigate('/plan');
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Indeterminate loading bar — visible during shimmer, collapsed after reveal.
          `h-0 overflow-hidden` removes the 4px stripe entirely once revealed, which
          also stops the `animate-shimmer-bar` animation from running in the background.
          `pointer-events-none` prevents any accidental click-through while transitioning. */}
      <div
        className={`w-full overflow-hidden bg-muted transition-all duration-300 shrink-0 pointer-events-none ${
          revealed ? 'h-0 opacity-0' : 'h-1 opacity-100'
        }`}
        aria-hidden="true"
        data-testid="progress-reveal-loading-bar"
      >
        {!revealed && <div className="h-full animate-shimmer-bar bg-primary" />}
      </div>

      {/* Reveal transition: skeleton → real content */}
      <div className="flex-1 min-h-0 relative">
        {/* Skeleton layer — fades out */}
        <div
          className={`absolute inset-0 overflow-y-auto transition-opacity duration-300 ${
            revealed ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          aria-hidden={revealed}
        >
          <RevealSkeleton />
        </div>

        {/* Real content layer — fades in */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 overflow-y-auto ${
            revealed ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Success banner */}
          <div
            className="flex items-center justify-between gap-4 px-6 pt-6 pb-4 max-w-4xl mx-auto"
            data-testid="progress-reveal-banner"
          >
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <span className="font-medium text-sm" data-testid="progress-reveal-message">
                {completed} completed &middot; {inProgress} in progress loaded!
              </span>
            </div>
            <Button onClick={handleNudge} className="gap-2 shrink-0" data-testid="progress-reveal-nudge">
              Build your 4-year plan
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {/* FR-4 radial + cards page — reveals the degree audit */}
          <ProgressAuditPage />
        </div>
      </div>
    </div>
  );
}
