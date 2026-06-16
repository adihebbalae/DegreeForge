// @vitest-environment jsdom
/**
 * ProgressPage — TASK-105 Phase 2
 *
 * Black-box checks:
 *   1. Direct nav (no fromUpload state) renders ProgressDashboard without crashing.
 *   2. fromUpload state renders ProgressReveal (skeleton visible).
 *   3. fromUpload=false renders ProgressDashboard directly.
 */
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// ── mock the heavy dashboard and reveal so the test focuses on routing ──────
vi.mock('@/components/home/ProgressDashboard', () => ({
  ProgressDashboard: () => (
    <div data-testid="mock-progress-dashboard">Progress Dashboard</div>
  ),
}));

vi.mock('@/components/ProgressReveal', () => ({
  ProgressReveal: ({ completed, inProgress }: { completed: number; inProgress: number }) => (
    <div data-testid="mock-progress-reveal">
      Reveal: {completed} completed / {inProgress} in progress
    </div>
  ),
}));

import ProgressPage from './ProgressPage';

afterEach(cleanup);

function renderWithState(state?: Record<string, unknown>) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/progress', state: state ?? null }]}
    >
      <Routes>
        <Route path="/progress" element={<ProgressPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProgressPage', () => {
  it('direct nav (no state) renders ProgressDashboard without crashing', () => {
    renderWithState();
    expect(screen.getByTestId('mock-progress-dashboard')).toBeDefined();
    expect(screen.queryByTestId('mock-progress-reveal')).toBeNull();
  });

  it('fromUpload=false renders ProgressDashboard (no reveal)', () => {
    renderWithState({ fromUpload: false });
    expect(screen.getByTestId('mock-progress-dashboard')).toBeDefined();
    expect(screen.queryByTestId('mock-progress-reveal')).toBeNull();
  });

  it('fromUpload=true renders ProgressReveal with counts from state', () => {
    renderWithState({ fromUpload: true, completed: 18, inProgress: 2, source: 'ida' });
    const reveal = screen.getByTestId('mock-progress-reveal');
    expect(reveal).toBeDefined();
    expect(reveal.textContent).toContain('18');
    expect(reveal.textContent).toContain('2');
    expect(screen.queryByTestId('mock-progress-dashboard')).toBeNull();
  });

  it('fromUpload=true with 0 counts still renders ProgressReveal (counts from state)', () => {
    // The no-false-reward gate is enforced in OnboardingWizard (never navigates on 0 courses);
    // ProgressPage itself just renders what it receives. This test verifies it doesn't crash.
    renderWithState({ fromUpload: true, completed: 0, inProgress: 0, source: 'transcript' });
    expect(screen.getByTestId('mock-progress-reveal')).toBeDefined();
  });
});
