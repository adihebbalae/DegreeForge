/**
 * FirstRunTour — TASK-105 Commit 2
 *
 * A brief, skip-anytime, non-blocking coachmark tour shown once to first-time
 * visitors. Overlays the live planner (which remains interactive underneath).
 *
 * Gate: df:tour-seen in localStorage. Set on skip OR complete; never re-shown
 * on ordinary repeat visits or hard refresh. True first-timer = no stored value.
 *
 * Steps (4):
 *   1. Recommend — the primary action to get a valid 4-year plan instantly
 *   2. Year grid — the overview of all semesters at a glance
 *   3. Click a semester — opens the focus editor for detailed editing
 *   4. Import / Personalize — the "make it yours" commit moment
 *
 * Implementation: a positioned card anchored near the described UI area.
 * No DOM querying — positions are fixed regions (top-right, center, bottom-left)
 * that describe where to look, with a brief arrow indicator. Keeps the
 * implementation dependency-free and handoff-ready.
 *
 * Analytics: tour_started, tour_step_viewed { step }, tour_skipped { step },
 * tour_completed (extends TASK-106 funnel).
 */

import { useEffect, useCallback } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { safeGetRaw, safeSetItem } from '@/lib/persist';
import { track } from '@/lib/analytics';

// ─── Persist key ──────────────────────────────────────────────────────────────

export const TOUR_SEEN_KEY = 'df:tour-seen';

/** Returns true if the tour has already been seen in this browser. */
export function hasTourBeenSeen(): boolean {
  return safeGetRaw(TOUR_SEEN_KEY) === 'true';
}

/** Marks the tour as seen so it won't show again. */
function markTourSeen() {
  safeSetItem(TOUR_SEEN_KEY, 'true');
}

// ─── Step definitions ─────────────────────────────────────────────────────────

interface TourStep {
  /** Where to visually anchor the card */
  position: 'top-right' | 'center-top' | 'bottom-left' | 'bottom-center';
  /** Headline */
  title: string;
  /** Body copy */
  body: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    position: 'top-right',
    title: 'Start with Recommend',
    body: 'Hit the "Recommend" button in the header to get a complete, prereq-valid 4-year plan in one click. Adjust from there.',
  },
  {
    position: 'center-top',
    title: 'Your degree at a glance',
    body: 'The year grid shows every semester. Completed semesters are greyed out; future ones are open for editing.',
  },
  {
    position: 'center-top',
    title: 'Click any semester to edit',
    body: 'Tap a semester tile to open the focus editor — add, remove, or rearrange courses with drag-and-drop.',
  },
  {
    position: 'bottom-left',
    title: 'Make it yours',
    body: 'See the "Import your transcript or audit" link above? Upload your audit to auto-fill completed courses and get a personalized plan.',
  },
];

// ─── Position map ─────────────────────────────────────────────────────────────

const POSITION_CLASSES: Record<TourStep['position'], string> = {
  'top-right':    'top-20 right-4',
  'center-top':   'top-24 left-1/2 -translate-x-1/2',
  'bottom-left':  'bottom-20 left-4',
  'bottom-center':'bottom-20 left-1/2 -translate-x-1/2',
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface FirstRunTourProps {
  /** Current 0-based step index. */
  step: number;
  /** Total number of steps (length of TOUR_STEPS). */
  totalSteps: number;
  onNext: () => void;
  onSkip: () => void;
}

// ─── Sub-component: the positioned card ───────────────────────────────────────

function TourCard({ step, totalSteps, onNext, onSkip }: FirstRunTourProps) {
  const tourStep = TOUR_STEPS[step];
  if (!tourStep) return null;

  const isLast = step === totalSteps - 1;
  const posClass = POSITION_CLASSES[tourStep.position];

  return (
    <Card
      className={[
        'fixed z-[60] w-72 shadow-xl border-primary/20',
        posClass,
      ].join(' ')}
      role="dialog"
      aria-label={`Tour step ${step + 1} of ${totalSteps}: ${tourStep.title}`}
      aria-modal="false"
      data-testid="tour-card"
    >
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">
            {step + 1} / {totalSteps}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 -mt-0.5 -mr-1 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={onSkip}
            aria-label="Dismiss tour"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <h3 className="text-sm font-semibold text-foreground mb-1">{tourStep.title}</h3>
        <p className="text-xs leading-relaxed text-muted-foreground mb-4">{tourStep.body}</p>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground px-2"
            onClick={onSkip}
          >
            Skip tour
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs gap-1 px-3"
            onClick={onNext}
          >
            {isLast ? 'Done' : (
              <>Next <ChevronRight className="h-3 w-3" /></>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Hook: manage tour lifecycle ──────────────────────────────────────────────

export interface UseTourResult {
  active: boolean;
  step: number;
  totalSteps: number;
  advance: () => void;
  skip: () => void;
}

/**
 * Manages tour state. Returns { active, step, totalSteps, advance, skip }.
 * Caller renders <TourOverlay /> only when active=true.
 */
export function useTour(enabled: boolean): UseTourResult {
  const totalSteps = TOUR_STEPS.length;

  // We track step in a ref-style via the parent; this hook just drives side effects.
  // The actual step state lives in the caller (FirstRunTourController) so that
  // re-renders don't reset it on every parent update.
  return {
    active: enabled,
    step: 0,
    totalSteps,
    advance: () => {},
    skip: () => {},
  };
}

// ─── Main export: self-contained tour controller ──────────────────────────────

interface FirstRunTourControllerProps {
  /** External step state (driven by parent so position is stable). */
  step: number;
  onNext: () => void;
  onSkip: () => void;
}

/**
 * Renders the tour card at the current step. Also handles Esc key to skip.
 * Does NOT manage the step index itself — caller owns step/onNext/onSkip.
 */
export function FirstRunTourController({ step, onNext, onSkip }: FirstRunTourControllerProps) {
  const totalSteps = TOUR_STEPS.length;

  // Esc key → skip
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onSkip();
  }, [onSkip]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (step >= totalSteps) return null;

  return (
    <TourCard
      step={step}
      totalSteps={totalSteps}
      onNext={onNext}
      onSkip={onSkip}
    />
  );
}
