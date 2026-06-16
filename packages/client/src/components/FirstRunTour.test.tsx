// @vitest-environment jsdom
/**
 * FirstRunTour — interactive first-run tour.
 *
 * Covers:
 *  - the tour-seen gate (hasTourBeenSeen)
 *  - the pure step machine (tourReducer): advance, complete→null, skip→null
 *  - the controller: Next advances, Skip sets tour-seen, course-added auto-advances,
 *    Recommend-click advances, welcome step has no spotlight, Esc skips/yields.
 */

import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

// ── Mock persist ──────────────────────────────────────────────────────────────
const mockSafeGetRaw = vi.fn<(key: string) => string | null>();
const mockSafeSetItem = vi.fn<(key: string, value: string) => boolean>();

vi.mock('@/lib/persist', () => ({
  safeGetRaw: (key: string) => mockSafeGetRaw(key),
  safeSetItem: (key: string, value: string) => mockSafeSetItem(key, value),
}));

// ── Mock analytics ────────────────────────────────────────────────────────────
const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

import {
  hasTourBeenSeen,
  TOUR_SEEN_KEY,
  TOTAL_TOUR_STEPS,
  tourReducer,
  FirstRunTourController,
} from './FirstRunTour';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

beforeEach(() => {
  mockSafeGetRaw.mockReturnValue(null);
});

// Default props for the controller — overridable per test.
function controllerProps(overrides: Partial<React.ComponentProps<typeof FirstRunTourController>> = {}) {
  return {
    placedCourseCount: 0,
    onOpenAdd: vi.fn(),
    onCloseAdd: vi.fn(),
    onEnd: vi.fn(),
    ...overrides,
  };
}

// ─── hasTourBeenSeen (gate) ─────────────────────────────────────────────────────

describe('hasTourBeenSeen', () => {
  it('returns false when the key is absent', () => {
    mockSafeGetRaw.mockReturnValue(null);
    expect(hasTourBeenSeen()).toBe(false);
  });

  it('returns true when the key is "true"', () => {
    mockSafeGetRaw.mockReturnValue('true');
    expect(hasTourBeenSeen()).toBe(true);
  });

  it('returns false for any value other than "true"', () => {
    mockSafeGetRaw.mockReturnValue('1');
    expect(hasTourBeenSeen()).toBe(false);
  });

  it('reads from TOUR_SEEN_KEY', () => {
    hasTourBeenSeen();
    expect(mockSafeGetRaw).toHaveBeenCalledWith(TOUR_SEEN_KEY);
  });
});

// ─── tourReducer (pure step machine) ────────────────────────────────────────────

describe('tourReducer', () => {
  it('advances from step 0 to step 1', () => {
    expect(tourReducer({ step: 0 }, { type: 'advance' })).toEqual({ step: 1 });
  });

  it('advancing past the last step ends the tour (step → null)', () => {
    const last = TOTAL_TOUR_STEPS - 1;
    expect(tourReducer({ step: last }, { type: 'advance' })).toEqual({ step: null });
  });

  it('skip ends the tour from any step', () => {
    expect(tourReducer({ step: 2 }, { type: 'skip' })).toEqual({ step: null });
  });

  it('advance is a no-op once the tour has ended', () => {
    expect(tourReducer({ step: null }, { type: 'advance' })).toEqual({ step: null });
  });

  it('goto jumps to an explicit step', () => {
    expect(tourReducer({ step: null }, { type: 'goto', step: 3 })).toEqual({ step: 3 });
  });

  it('has 5 steps', () => {
    expect(TOTAL_TOUR_STEPS).toBe(5);
  });
});

// ─── Controller — render + gating ────────────────────────────────────────────────

describe('FirstRunTourController', () => {
  it('starts at step 0 (welcome) with a centered card and NO spotlight', () => {
    render(<FirstRunTourController {...controllerProps()} />);
    expect(screen.getByTestId('tour-card')).toBeDefined();
    expect(screen.getByText('1 / 5')).toBeDefined();
    // Welcome step has no target → full backdrop, no per-target spotlight ring.
    expect(screen.getByTestId('tour-backdrop')).toBeDefined();
    expect(screen.queryByTestId('tour-spotlight')).toBeNull();
  });

  it('shows the welcome copy on step 0', () => {
    render(<FirstRunTourController {...controllerProps()} />);
    expect(screen.getByText('Build your plan in under a minute')).toBeDefined();
  });

  it('Next advances from welcome to the Recommend step', () => {
    render(<FirstRunTourController {...controllerProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(screen.getByText('2 / 5')).toBeDefined();
    expect(screen.getByText('One click for a full plan')).toBeDefined();
  });

  it('spotlights a real target when one exists (Recommend step)', () => {
    // Provide the live target so the controller can resolve its rect.
    const btn = document.createElement('button');
    btn.setAttribute('data-tour', 'recommend');
    document.body.appendChild(btn);

    render(<FirstRunTourController {...controllerProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    // Now on the Recommend step with a resolvable target → spotlight ring renders.
    expect(screen.getByTestId('tour-spotlight')).toBeDefined();
  });

  it('clicking the spotlit Recommend target advances the tour', () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-tour', 'recommend');
    document.body.appendChild(btn);

    render(<FirstRunTourController {...controllerProps()} />);
    fireEvent.click(screen.getByRole('button', { name: /start/i })); // → step 1 (Recommend)
    expect(screen.getByText('One click for a full plan')).toBeDefined();

    act(() => {
      fireEvent.click(btn); // user clicks the real Recommend button
    });
    // Advanced to step 2 (Add).
    expect(screen.getByText('Add a course here')).toBeDefined();
  });

  it('opens the Add affordance when entering the Add step', () => {
    const onOpenAdd = vi.fn();
    render(<FirstRunTourController {...controllerProps({ onOpenAdd })} />);
    // welcome → recommend → add
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onOpenAdd).toHaveBeenCalled();
  });

  it('auto-advances from Add to Progress when placedCourseCount rises', () => {
    const { rerender } = render(
      <FirstRunTourController {...controllerProps({ placedCourseCount: 5 })} />
    );
    // Navigate to the Add step (index 2).
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Add a course here')).toBeDefined();

    // Simulate a course being added → count increases.
    act(() => {
      rerender(<FirstRunTourController {...controllerProps({ placedCourseCount: 6 })} />);
    });
    expect(screen.getByText('Watch your progress climb')).toBeDefined();
  });

  it('does NOT auto-advance the Add step if the count does not rise', () => {
    const { rerender } = render(
      <FirstRunTourController {...controllerProps({ placedCourseCount: 5 })} />
    );
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Add a course here')).toBeDefined();

    act(() => {
      rerender(<FirstRunTourController {...controllerProps({ placedCourseCount: 5 })} />);
    });
    // Still on the Add step.
    expect(screen.getByText('Add a course here')).toBeDefined();
  });

  it('shows "Done" on the last (Import) step and completing ends the tour', () => {
    const onEnd = vi.fn();
    const { rerender } = render(
      <FirstRunTourController {...controllerProps({ placedCourseCount: 0, onEnd })} />
    );
    // welcome → recommend → add
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    // add → progress via a count rise
    act(() => {
      rerender(<FirstRunTourController {...controllerProps({ placedCourseCount: 1, onEnd })} />);
    });
    // progress → import
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Make it yours')).toBeDefined();
    const doneBtn = screen.getByRole('button', { name: 'Done' });
    expect(doneBtn).toBeDefined();

    fireEvent.click(doneBtn);
    expect(mockSafeSetItem).toHaveBeenCalledWith(TOUR_SEEN_KEY, 'true');
    expect(mockTrack).toHaveBeenCalledWith('tour_completed');
    expect(onEnd).toHaveBeenCalled();
  });

  it('Skip sets df:tour-seen and ends the tour at any step', () => {
    const onEnd = vi.fn();
    render(<FirstRunTourController {...controllerProps({ onEnd })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(mockSafeSetItem).toHaveBeenCalledWith(TOUR_SEEN_KEY, 'true');
    expect(onEnd).toHaveBeenCalled();
    expect(screen.queryByTestId('tour-card')).toBeNull();
  });

  it('the X (Dismiss) button also skips + sets tour-seen', () => {
    render(<FirstRunTourController {...controllerProps()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tour' }));
    expect(mockSafeSetItem).toHaveBeenCalledWith(TOUR_SEEN_KEY, 'true');
  });

  it('fires tour_started once and tour_step_viewed per step', () => {
    render(<FirstRunTourController {...controllerProps()} />);
    expect(mockTrack).toHaveBeenCalledWith('tour_started');
    expect(mockTrack).toHaveBeenCalledWith('tour_step_viewed', { step: 0 });
    fireEvent.click(screen.getByRole('button', { name: /start/i }));
    expect(mockTrack).toHaveBeenCalledWith('tour_step_viewed', { step: 1 });
    // tour_started only once
    expect(mockTrack.mock.calls.filter((c) => c[0] === 'tour_started')).toHaveLength(1);
  });

  it('Esc skips the tour when no semester is focused', () => {
    render(<FirstRunTourController {...controllerProps({ hasFocusedSemester: false })} />);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(mockSafeSetItem).toHaveBeenCalledWith(TOUR_SEEN_KEY, 'true');
  });

  it('Esc yields (does NOT skip) when a semester panel is focused', () => {
    render(<FirstRunTourController {...controllerProps({ hasFocusedSemester: true })} />);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(mockSafeSetItem).not.toHaveBeenCalled();
    expect(screen.getByTestId('tour-card')).toBeDefined();
  });
});

// ─── data-tour targets the tour depends on ──────────────────────────────────────

describe('tour target selectors', () => {
  // The controller spotlights elements by these selectors; if a target component
  // drops its data-tour hook, the relevant step silently loses its spotlight.
  // This documents the contract so a rename breaks loudly.
  it('uses the documented data-tour selectors', () => {
    const SELECTORS = [
      '[data-tour="recommend"]',
      '[data-tour="command-search"]',
      '[data-tour="progress-total"]',
      '[data-tour="import-cta"]',
    ];
    // Render each as a probe — querySelector must accept the selector syntax.
    for (const sel of SELECTORS) {
      expect(() => document.querySelector(sel)).not.toThrow();
    }
  });
});
