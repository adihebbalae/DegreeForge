/**
 * FirstRunTour — interactive first-run walkthrough (replaces the static corner card).
 *
 * Shown once to first-time visitors on the planner. Dims + blurs the page and
 * spotlights one live DOM target at a time with an arrow + coach card. The
 * spotlit target stays sharp and fully interactive (clickable through a cutout
 * in the backdrop). Advances when the user performs the step's action, with a
 * "Next" fallback so it never traps, and a persistent "Skip tour".
 *
 * Gate: df:tour-seen in localStorage. Set on skip OR complete; never re-shown on
 * ordinary repeat visits or hard refresh. True first-timer = no stored value.
 *
 * Steps (5):
 *   0. Welcome — no spotlight (centered card). [Next]
 *   1. Recommend — spotlight the header Recommend button. (advance on click OR Next)
 *   2. Add — opens the command palette and spotlights its search input.
 *           (auto-advances when a course is actually added — placedCount rises)
 *   3. Progress — spotlight the "X / N hrs" total, which now reflects the add. [Next]
 *   4. Import — spotlight the "Import your transcript / audit" CTA. [Done]
 *
 * Spotlight technique: a four-rectangle frame (top/right/bottom/left of the
 * target's bounding rect). Each frame rect is dark + backdrop-blurred and
 * absorbs clicks; the gap over the target is left open so the target receives
 * pointer events directly. No new dependency — pure rect math + Tailwind.
 *
 * Analytics: tour_started, tour_step_viewed { step }, tour_skipped { step },
 * tour_completed (extends the TASK-106 funnel — preserved from the static tour).
 */

import { useEffect, useState, useCallback, useLayoutEffect, useRef, useReducer } from 'react';
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

type AdvanceTrigger = 'next' | 'target-click' | 'course-added';

interface TourStep {
  /**
   * CSS selector for the live DOM element to spotlight. `null` = no target
   * (centered welcome card, no cutout).
   */
  target: string | null;
  title: string;
  body: string;
  /** What makes this step advance (besides the always-present Next/Done button). */
  advanceOn: AdvanceTrigger;
  /** Label for the primary button. */
  cta: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    title: 'Build your plan in under a minute',
    body: 'A quick tour of the four moves that turn this example into your degree plan.',
    advanceOn: 'next',
    cta: 'Start',
  },
  {
    target: '[data-tour="recommend"]',
    title: 'One click for a full plan',
    body: 'Hit Recommend to generate a complete, prereq-valid 4-year plan instantly. Try it, or skip ahead.',
    advanceOn: 'target-click',
    cta: 'Next',
  },
  {
    target: '[data-tour="command-search"]',
    title: 'Add a course here',
    body: 'Search the catalog and press Enter to drop a course into a semester. Add one to continue.',
    advanceOn: 'course-added',
    cta: 'Next',
  },
  {
    target: '[data-tour="progress-total"]',
    title: 'Watch your progress climb',
    body: 'Every course you add moves your degree-hours total — your live picture of how close you are to graduating.',
    advanceOn: 'next',
    cta: 'Next',
  },
  {
    target: '[data-tour="import-cta"]',
    title: 'Make it yours',
    body: 'Import your transcript or degree audit to auto-fill completed courses and personalize the whole plan.',
    advanceOn: 'next',
    cta: 'Done',
  },
];

/** Total number of tour steps. Import in callers to avoid magic numbers. */
export const TOTAL_TOUR_STEPS = TOUR_STEPS.length;

// ─── Geometry ─────────────────────────────────────────────────────────────────

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Padding around the target inside the spotlight cutout. */
const SPOTLIGHT_PAD = 6;

/** Coach-card dimensions used for positioning math (matches the rendered card). */
const CARD_WIDTH = 300;
const CARD_GAP = 14; // gap between target and card / arrow

type ArrowSide = 'top' | 'bottom' | 'left' | 'right';

interface CardPlacement {
  top: number;
  left: number;
  arrow: ArrowSide;
  /** Arrow offset along the card edge (px from the card's top-left toward the target). */
  arrowOffset: number;
}

/**
 * Place the coach card relative to the target rect so it never covers the target
 * and stays on-screen. Returns absolute viewport coordinates + which side the
 * arrow points from. Estimates card height when not yet measured.
 */
function placeCard(target: Rect | null, vw: number, vh: number, cardHeight: number): CardPlacement {
  // No target → center the card (welcome step).
  if (!target) {
    return {
      top: Math.max(16, vh / 2 - cardHeight / 2),
      left: Math.max(16, vw / 2 - CARD_WIDTH / 2),
      arrow: 'top',
      arrowOffset: -100, // off-card → hidden
    };
  }

  const spaceBelow = vh - (target.top + target.height);
  const spaceAbove = target.top;
  const spaceRight = vw - (target.left + target.width);
  const spaceLeft = target.left;

  const clampLeft = (l: number) => Math.min(Math.max(8, l), vw - CARD_WIDTH - 8);
  const clampTop = (t: number) => Math.min(Math.max(8, t), vh - cardHeight - 8);

  const targetCenterX = target.left + target.width / 2;
  const targetCenterY = target.top + target.height / 2;

  // Prefer below, then above, then right, then left — whichever fits.
  if (spaceBelow >= cardHeight + CARD_GAP) {
    const left = clampLeft(targetCenterX - CARD_WIDTH / 2);
    return {
      top: target.top + target.height + CARD_GAP,
      left,
      arrow: 'top',
      arrowOffset: targetCenterX - left,
    };
  }
  if (spaceAbove >= cardHeight + CARD_GAP) {
    const left = clampLeft(targetCenterX - CARD_WIDTH / 2);
    return {
      top: target.top - cardHeight - CARD_GAP,
      left,
      arrow: 'bottom',
      arrowOffset: targetCenterX - left,
    };
  }
  if (spaceRight >= CARD_WIDTH + CARD_GAP) {
    const top = clampTop(targetCenterY - cardHeight / 2);
    return {
      top,
      left: target.left + target.width + CARD_GAP,
      arrow: 'left',
      arrowOffset: targetCenterY - top,
    };
  }
  if (spaceLeft >= CARD_WIDTH + CARD_GAP) {
    const top = clampTop(targetCenterY - cardHeight / 2);
    return {
      top,
      left: target.left - CARD_WIDTH - CARD_GAP,
      arrow: 'right',
      arrowOffset: targetCenterY - top,
    };
  }

  // Cramped (small viewport): drop the card below and let it overlap minimally.
  const left = clampLeft(targetCenterX - CARD_WIDTH / 2);
  return {
    top: clampTop(target.top + target.height + CARD_GAP),
    left,
    arrow: 'top',
    arrowOffset: targetCenterX - left,
  };
}

// ─── Spotlight backdrop (four-rect frame + arrow card) ─────────────────────────

interface SpotlightProps {
  targetRect: Rect | null;
  step: number;
  totalSteps: number;
  title: string;
  body: string;
  cta: string;
  onNext: () => void;
  onSkip: () => void;
}

function Spotlight({ targetRect, step, totalSteps, title, body, cta, onNext, onSkip }: SpotlightProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(150);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);

  // Track viewport so the card re-clamps on resize.
  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Measure the card after render so placement math uses the real height.
  useLayoutEffect(() => {
    if (cardRef.current) {
      const h = cardRef.current.offsetHeight;
      if (h && Math.abs(h - cardHeight) > 1) setCardHeight(h);
    }
  }, [title, body, step, cardHeight]);

  const placement = placeCard(targetRect, vw, vh, cardHeight);

  // Cutout rect (padded), clamped to the viewport.
  const cut = targetRect
    ? {
        top: Math.max(0, targetRect.top - SPOTLIGHT_PAD),
        left: Math.max(0, targetRect.left - SPOTLIGHT_PAD),
        width: targetRect.width + SPOTLIGHT_PAD * 2,
        height: targetRect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  const frameClass = 'fixed bg-black/55 backdrop-blur-[3px] z-[55]';

  return (
    <div role="dialog" aria-modal="false" aria-label={`Tour step ${step + 1} of ${totalSteps}`}>
      {/* Backdrop: four blurred rects framing the cutout, or one full overlay when no target. */}
      {cut ? (
        <>
          {/* top */}
          <div className={frameClass} style={{ top: 0, left: 0, width: '100%', height: cut.top }} />
          {/* bottom */}
          <div
            className={frameClass}
            style={{ top: cut.top + cut.height, left: 0, width: '100%', height: Math.max(0, vh - (cut.top + cut.height)) }}
          />
          {/* left */}
          <div
            className={frameClass}
            style={{ top: cut.top, left: 0, width: cut.left, height: cut.height }}
          />
          {/* right */}
          <div
            className={frameClass}
            style={{ top: cut.top, left: cut.left + cut.width, width: Math.max(0, vw - (cut.left + cut.width)), height: cut.height }}
          />
          {/* spotlight ring (decorative, lets clicks through) */}
          <div
            className="fixed z-[56] rounded-md ring-2 ring-primary/70 pointer-events-none"
            style={{ top: cut.top, left: cut.left, width: cut.width, height: cut.height }}
            data-testid="tour-spotlight"
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/55 backdrop-blur-[3px] z-[55]" data-testid="tour-backdrop" />
      )}

      {/* Coach card */}
      <Card
        ref={cardRef}
        className="fixed z-[60] shadow-xl border-primary/30"
        style={{ top: placement.top, left: placement.left, width: CARD_WIDTH }}
        data-testid="tour-card"
      >
        {/* Arrow */}
        {targetRect && <Arrow side={placement.arrow} offset={placement.arrowOffset} />}

        <div className="p-4">
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

          <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
          <p className="text-xs leading-relaxed text-muted-foreground mb-4">{body}</p>

          <div className="flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground px-2"
              onClick={onSkip}
            >
              Skip tour
            </Button>
            <Button size="sm" className="h-7 text-xs gap-1 px-3" onClick={onNext}>
              {cta}
              {cta !== 'Done' && <ChevronRight className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Arrow (CSS triangle pointing from the card edge toward the target) ────────

function Arrow({ side, offset }: { side: ArrowSide; offset: number }) {
  const size = 8;
  const base: React.CSSProperties = { position: 'absolute', width: 0, height: 0 };
  // Tailwind border color → use the card's border color (primary/30) via inline.
  const color = 'hsl(var(--primary) / 0.4)';

  switch (side) {
    case 'top': // card is below target → arrow on top edge pointing up
      return (
        <div
          style={{
            ...base,
            top: -size,
            left: Math.max(8, Math.min(offset - size, CARD_WIDTH - 2 * size - 8)),
            borderLeft: `${size}px solid transparent`,
            borderRight: `${size}px solid transparent`,
            borderBottom: `${size}px solid ${color}`,
          }}
          aria-hidden="true"
        />
      );
    case 'bottom': // card above target → arrow on bottom edge pointing down
      return (
        <div
          style={{
            ...base,
            bottom: -size,
            left: Math.max(8, Math.min(offset - size, CARD_WIDTH - 2 * size - 8)),
            borderLeft: `${size}px solid transparent`,
            borderRight: `${size}px solid transparent`,
            borderTop: `${size}px solid ${color}`,
          }}
          aria-hidden="true"
        />
      );
    case 'left': // card right of target → arrow on left edge pointing left
      return (
        <div
          style={{
            ...base,
            left: -size,
            top: Math.max(8, offset - size),
            borderTop: `${size}px solid transparent`,
            borderBottom: `${size}px solid transparent`,
            borderRight: `${size}px solid ${color}`,
          }}
          aria-hidden="true"
        />
      );
    case 'right': // card left of target → arrow on right edge pointing right
      return (
        <div
          style={{
            ...base,
            right: -size,
            top: Math.max(8, offset - size),
            borderTop: `${size}px solid transparent`,
            borderBottom: `${size}px solid transparent`,
            borderLeft: `${size}px solid ${color}`,
          }}
          aria-hidden="true"
        />
      );
  }
}

// ─── Target-rect tracking hook ─────────────────────────────────────────────────

/**
 * Resolves a CSS selector to a live bounding rect and keeps it fresh across
 * resize/scroll and a short poll (targets can mount a frame late, e.g. the
 * command-palette input). Returns null while the target is absent.
 */
function useTargetRect(selector: string | null, active: boolean): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!active || !selector) {
      setRect(null);
      return;
    }

    let raf = 0;
    const measure = () => {
      const el = document.querySelector(selector);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setRect(null);
      }
    };

    measure();
    // Poll briefly: the command-palette input mounts a frame after we open it,
    // and the progress total re-lays-out after a course is added.
    const interval = setInterval(measure, 120);
    const onChange = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', onChange);
    window.addEventListener('scroll', onChange, true);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onChange);
      window.removeEventListener('scroll', onChange, true);
    };
  }, [selector, active]);

  return rect;
}

// ─── Step state machine (pure, unit-testable) ──────────────────────────────────

export interface TourMachineState {
  /** Current 0-based step, or null when the tour is inactive. */
  step: number | null;
}

/**
 * Pure reducer for the tour step machine. Centralizes advance/complete/skip so
 * the controller and tests share one source of truth.
 */
export function tourReducer(
  state: TourMachineState,
  action:
    | { type: 'advance' }
    | { type: 'skip' }
    | { type: 'goto'; step: number }
): TourMachineState {
  switch (action.type) {
    case 'advance': {
      if (state.step === null) return state;
      const next = state.step + 1;
      return { step: next >= TOTAL_TOUR_STEPS ? null : next };
    }
    case 'goto':
      return { step: action.step };
    case 'skip':
      return { step: null };
  }
}

// ─── Controller (self-contained: owns step machine, spotlight, add-detection) ──

interface FirstRunTourControllerProps {
  /**
   * Count of courses currently placed in the plan (sum of all semester arrays).
   * Step 2 ("Add a course") auto-advances when this rises above the count
   * captured on entering the step.
   */
  placedCourseCount: number;
  /**
   * Opens the Add affordance (the command palette). Called when step 2 is
   * entered so the user has a visible, spotlightable target. Idempotent.
   */
  onOpenAdd: () => void;
  /** Closes the Add affordance — called when leaving step 2 if still open. */
  onCloseAdd: () => void;
  /**
   * When true, an Esc keypress is consumed by the planner (a semester panel is
   * focused) rather than skipping the tour.
   */
  hasFocusedSemester?: boolean;
  /** Notifies the parent that the tour ended (skip or complete) so it can clean up. */
  onEnd?: () => void;
}

/**
 * Renders the interactive tour, starting at step 0. Owns the step index,
 * spotlight geometry, action detection (Recommend click, course added), and the
 * df:tour-seen gate. Mount this only when `hasTourBeenSeen()` is false.
 */
export function FirstRunTourController({
  placedCourseCount,
  onOpenAdd,
  onCloseAdd,
  hasFocusedSemester = false,
  onEnd,
}: FirstRunTourControllerProps) {
  const [{ step }, dispatch] = useReducer(tourReducer, { step: 0 });
  const active = step !== null;

  // Course count captured when the Add step began — an increase = a real add.
  const addBaselineRef = useRef<number | null>(null);

  const currentStep = step !== null ? TOUR_STEPS[step] : null;
  const targetSelector = currentStep?.target ?? null;
  const targetRect = useTargetRect(targetSelector, active);

  // ── Analytics: started + per-step viewed ──────────────────────────────────
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current && step === 0) {
      startedRef.current = true;
      track('tour_started');
    }
    if (step !== null) track('tour_step_viewed', { step });
  }, [step]);

  // ── End helpers ────────────────────────────────────────────────────────────
  const endTour = useCallback(() => {
    markTourSeen();
    onCloseAdd();
    onEnd?.();
  }, [onCloseAdd, onEnd]);

  const handleSkip = useCallback(() => {
    if (step === null) return;
    track('tour_skipped', { step });
    dispatch({ type: 'skip' });
    endTour();
  }, [step, dispatch, endTour]);

  const handleNext = useCallback(() => {
    if (step === null) return;
    if (step + 1 >= TOTAL_TOUR_STEPS) {
      track('tour_completed');
      dispatch({ type: 'advance' }); // → null
      endTour();
      return;
    }
    dispatch({ type: 'advance' });
  }, [step, dispatch, endTour]);

  // ── Step 2 (Add): open the palette on entry, capture the baseline count, and
  //    close the palette when leaving. ────────────────────────────────────────
  const addStepIndex = TOUR_STEPS.findIndex((s) => s.advanceOn === 'course-added');
  useEffect(() => {
    if (step === addStepIndex) {
      addBaselineRef.current = placedCourseCount;
      onOpenAdd();
    } else if (step !== null) {
      // Past the add step (or any other step) — make sure we don't leave it open.
      if (addBaselineRef.current !== null && step !== addStepIndex) {
        onCloseAdd();
        addBaselineRef.current = null;
      }
    }
  // placedCourseCount intentionally excluded — only the baseline at ENTRY matters.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, addStepIndex]);

  // ── Auto-advance: a course was added during the Add step. ──────────────────
  useEffect(() => {
    if (step !== addStepIndex) return;
    if (addBaselineRef.current === null) return;
    if (placedCourseCount > addBaselineRef.current) {
      handleNext();
    }
  }, [placedCourseCount, step, addStepIndex, handleNext]);

  // ── Auto-advance: the Recommend target was clicked. ────────────────────────
  useEffect(() => {
    if (!currentStep || currentStep.advanceOn !== 'target-click' || !targetSelector) return;
    const el = document.querySelector(targetSelector);
    if (!el) return;
    const onClick = () => handleNext();
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [currentStep, targetSelector, handleNext, targetRect]);

  // ── Esc → skip (yield to the planner when a semester panel is focused). ────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hasFocusedSemester) handleSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSkip, hasFocusedSemester]);

  if (step === null || !currentStep) return null;

  return (
    <Spotlight
      targetRect={targetRect}
      step={step}
      totalSteps={TOTAL_TOUR_STEPS}
      title={currentStep.title}
      body={currentStep.body}
      cta={currentStep.cta}
      onNext={handleNext}
      onSkip={handleSkip}
    />
  );
}
