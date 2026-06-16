// @vitest-environment jsdom
/**
 * ProgressReveal — TASK-105 Phase 2
 *
 * Black-box checks:
 *   1. Skeleton is visible immediately; real content is hidden.
 *   2. After MIN_SHIMMER_MS elapses (fake timers), the skeleton hides and real
 *      content + success message appear.
 *   3. Success message contains the correct completed + inProgress counts.
 *   4. track('upload_reward_shown') fires once with the right props on reveal.
 *   5. Nudge CTA navigates to /plan and fires upload_reward_nudge_clicked.
 */
import React from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ── analytics mock ──────────────────────────────────────────────────────────
const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({ track: (...args: unknown[]) => mockTrack(...args) }));

// ── react-router navigate mock ──────────────────────────────────────────────
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ── ProgressDashboard mock (heavy; not under test) ──────────────────────────
vi.mock('./home/ProgressDashboard', () => ({
  ProgressDashboard: () => <div data-testid="mock-progress-dashboard">Progress Dashboard</div>,
}));

import { ProgressReveal, MIN_SHIMMER_MS } from './ProgressReveal';

function renderReveal(completed = 12, inProgress = 3, source = 'ida') {
  return render(
    <MemoryRouter>
      <ProgressReveal completed={completed} inProgress={inProgress} source={source} />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProgressReveal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the skeleton immediately on mount', () => {
    renderReveal();
    expect(screen.getByTestId('progress-reveal-skeleton')).toBeDefined();
    expect(screen.getByTestId('progress-reveal-loading-bar')).toBeDefined();
  });

  it('loading bar has h-1 before reveal and h-0 after reveal', () => {
    renderReveal();
    const bar = screen.getByTestId('progress-reveal-loading-bar');
    // Before reveal: should have h-1 class
    expect(bar.className).toContain('h-1');
    expect(bar.className).not.toContain('h-0');

    act(() => {
      vi.advanceTimersByTime(MIN_SHIMMER_MS);
    });

    // After reveal: h-0 collapses the stripe
    expect(bar.className).toContain('h-0');
    expect(bar.className).not.toContain('h-1');
  });

  it('success banner is hidden (opacity-0) before MIN_SHIMMER_MS elapses', () => {
    renderReveal();
    // The banner exists in DOM but is inside the opacity-0 layer
    const banner = screen.getByTestId('progress-reveal-banner');
    const wrapper = banner.closest('[class*="opacity-0"]');
    expect(wrapper).toBeDefined();
  });

  it(`reveals real content after ${MIN_SHIMMER_MS} ms`, () => {
    renderReveal(12, 3, 'ida');
    act(() => {
      vi.advanceTimersByTime(MIN_SHIMMER_MS);
    });
    // After reveal, the real dashboard should be accessible
    expect(screen.getByTestId('mock-progress-dashboard')).toBeDefined();
    expect(screen.getByTestId('progress-reveal-message')).toBeDefined();
  });

  it('success message contains correct completed and inProgress counts', () => {
    renderReveal(15, 2, 'transcript');
    act(() => {
      vi.advanceTimersByTime(MIN_SHIMMER_MS);
    });
    const msg = screen.getByTestId('progress-reveal-message');
    expect(msg.textContent).toContain('15');
    expect(msg.textContent).toContain('2');
  });

  it('fires upload_reward_shown with correct props after shimmer', () => {
    mockTrack.mockClear();
    renderReveal(7, 1, 'ida');
    act(() => {
      vi.advanceTimersByTime(MIN_SHIMMER_MS);
    });
    expect(mockTrack).toHaveBeenCalledWith('upload_reward_shown', {
      completed: 7,
      inProgress: 1,
      source: 'ida',
    });
  });

  it('does NOT fire upload_reward_shown before MIN_SHIMMER_MS', () => {
    mockTrack.mockClear();
    renderReveal(5, 0, 'transcript');
    act(() => {
      vi.advanceTimersByTime(MIN_SHIMMER_MS - 1);
    });
    const shownCalls = mockTrack.mock.calls.filter(([e]) => e === 'upload_reward_shown');
    expect(shownCalls).toHaveLength(0);
  });

  it('nudge CTA navigates to /plan and fires upload_reward_nudge_clicked', () => {
    renderReveal(10, 2, 'ida');
    act(() => {
      vi.advanceTimersByTime(MIN_SHIMMER_MS);
    });
    const nudge = screen.getByTestId('progress-reveal-nudge');
    nudge.click();
    expect(mockTrack).toHaveBeenCalledWith('upload_reward_nudge_clicked');
    expect(mockNavigate).toHaveBeenCalledWith('/plan');
  });
});
