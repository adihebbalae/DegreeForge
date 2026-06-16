// @vitest-environment jsdom
/**
 * FirstRunTour — TASK-105 Commit 2
 *
 * Covers the tour-gating logic (hasTourBeenSeen) and the controller's
 * skip/next/Esc behavior.
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

import { hasTourBeenSeen, TOUR_SEEN_KEY, FirstRunTourController } from './FirstRunTour';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  mockSafeGetRaw.mockReturnValue(null);
});

// ─── hasTourBeenSeen ──────────────────────────────────────────────────────────

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

// ─── FirstRunTourController ───────────────────────────────────────────────────

describe('FirstRunTourController', () => {
  it('renders the tour card for step 0', () => {
    render(
      <FirstRunTourController step={0} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.getByTestId('tour-card')).toBeDefined();
    expect(screen.getByText('1 / 4')).toBeDefined();
  });

  it('renders the correct step title for each step', () => {
    const { rerender } = render(
      <FirstRunTourController step={0} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.getByText('Start with Recommend')).toBeDefined();

    rerender(<FirstRunTourController step={1} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Your degree at a glance')).toBeDefined();

    rerender(<FirstRunTourController step={2} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Click any semester to edit')).toBeDefined();

    rerender(<FirstRunTourController step={3} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByText('Make it yours')).toBeDefined();
  });

  it('shows "Done" button on the last step', () => {
    render(
      <FirstRunTourController step={3} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    expect(screen.getByRole('button', { name: 'Done' })).toBeDefined();
  });

  it('shows "Next" on non-last steps', () => {
    render(
      <FirstRunTourController step={0} onNext={vi.fn()} onSkip={vi.fn()} />
    );
    // The Next button includes a ChevronRight icon; text is "Next"
    const nextBtn = screen.getByRole('button', { name: /next/i });
    expect(nextBtn).toBeDefined();
  });

  it('calls onNext when Next is clicked', () => {
    const onNext = vi.fn();
    render(<FirstRunTourController step={0} onNext={onNext} onSkip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip when Skip tour is clicked', () => {
    const onSkip = vi.fn();
    render(<FirstRunTourController step={0} onNext={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip when the X (Dismiss) button is clicked', () => {
    const onSkip = vi.fn();
    render(<FirstRunTourController step={0} onNext={vi.fn()} onSkip={onSkip} />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss tour' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('calls onSkip when Esc is pressed', () => {
    const onSkip = vi.fn();
    render(<FirstRunTourController step={0} onNext={vi.fn()} onSkip={onSkip} />);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when step >= totalSteps', () => {
    render(<FirstRunTourController step={99} onNext={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByTestId('tour-card')).toBeNull();
  });

  it('cleans up the keydown listener on unmount', () => {
    const onSkip = vi.fn();
    const { unmount } = render(
      <FirstRunTourController step={0} onNext={vi.fn()} onSkip={onSkip} />
    );
    unmount();
    // After unmount, Esc should NOT call onSkip
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(onSkip).toHaveBeenCalledTimes(0);
  });
});
